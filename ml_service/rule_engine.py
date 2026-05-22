import json
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# ---------- Types ----------

@dataclass(frozen=True)
class Event:
    """Simple event representation.
    - `event_type`: string identifying the type of event (e.g., "GAZE_AWAY")
    - `payload`: arbitrary mapping containing whatever data the rule needs. For
      threshold rules, a `value` key is expected. For duration rules, a
      `duration_ms` key is expected. For frequency rules, no extra data is needed
      beyond the occurrence timestamp (handled internally).
    """
    event_type: str
    payload: Dict[str, Any]
    timestamp_ms: int = field(default_factory=lambda: int(time.time() * 1000))


@dataclass
class Condition:
    type: str  # "threshold", "duration", "frequency"
    threshold: Optional[int] = None  # used for threshold & duration
    window_ms: Optional[int] = None  # used for duration & frequency
    count: Optional[int] = None  # used for frequency (events required)


@dataclass
class Rule:
    rule_id: str
    event_type: str
    enabled: bool
    condition: Condition
    severity: str  # "LOW", "MEDIUM", "HIGH"
    penalty_points: int
    cooldown_ms: int

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "Rule":
        cond = d["condition"]
        condition = Condition(
            type=cond["type"],
            threshold=cond.get("thresholdMs") or cond.get("threshold"),
            window_ms=cond.get("windowMs"),
            count=cond.get("count"),
        )
        return Rule(
            rule_id=d["ruleId"],
            event_type=d["eventType"],
            enabled=d.get("enabled", True),
            condition=condition,
            severity=d["severity"].upper(),
            penalty_points=d["penaltyPoints"],
            cooldown_ms=d["cooldownMs"],
        )


@dataclass
class Violation:
    rule_id: str
    severity: str
    penalty: float
    timestamp_ms: int
    # optional extra info for callers
    details: Dict[str, Any] = field(default_factory=dict)

# ---------- Session State ----------

class SessionStore:
    """Thread‑safe in‑memory store for per‑session rule state and violations."""

    def __init__(self):
        self._lock = threading.RLock()
        # Mapping: session_id -> per‑rule accumulator dict
        self._state: Dict[str, Dict[str, Dict[str, Any]]] = {}
        # Mapping: session_id -> list of recent Violations (ordered by timestamp)
        self._violations: Dict[str, List[Violation]] = {}
        # Mapping: session_id -> current numeric score (starts at 100)
        self._scores: Dict[str, float] = {}

    def _init_session(self, session_id: str) -> None:
        if session_id not in self._state:
            self._state[session_id] = {}
            self._violations[session_id] = []
            self._scores[session_id] = 100.0

    def get_rule_state(self, session_id: str, rule_id: str) -> Dict[str, Any]:
        with self._lock:
            self._init_session(session_id)
            return self._state[session_id].setdefault(
                rule_id, {"last_fired_at": 0, "accumulated_ms": 0, "occurrence_count": 0, "timestamps": []}
            )

    def record_violation(self, session_id: str, violation: Violation) -> None:
        with self._lock:
            self._init_session(session_id)
            self._violations[session_id].append(violation)
            # keep only recent violations that could affect correlation (window + a safety margin)
            # we keep all for simplicity as the list is short per session.
            self._scores[session_id] = max(0.0, self._scores[session_id] - violation.penalty)

    def recent_violations(self, session_id: str, within_ms: int, now_ms: int) -> List[Violation]:
        with self._lock:
            self._init_session(session_id)
            return [v for v in self._violations[session_id] if now_ms - v.timestamp_ms <= within_ms]

    def get_score(self, session_id: str) -> float:
        with self._lock:
            self._init_session(session_id)
            return self._scores[session_id]

    def reset(self, session_id: str) -> None:
        with self._lock:
            self._state.pop(session_id, None)
            self._violations.pop(session_id, None)
            self._scores.pop(session_id, None)

# ---------- Rule Engine ----------

class RuleEngine:
    """Pure‑Python rule engine with thread‑safe in‑memory state.

    Usage:
        engine = RuleEngine()
        engine.load_rules("rules.json")
        violations = engine.process_event(session_id, Event(...))
    """

    SEVERITY_ORDER = ["LOW", "MEDIUM", "HIGH"]

    def __init__(self, correlation_window_ms: int = 30_000):
        self._rules: List[Rule] = []
        self._store = SessionStore()
        self.correlation_window_ms = correlation_window_ms
        self._global_lock = threading.RLock()  # protects rule list modifications

    # ---------- Rule loading ----------
    def load_rules(self, path: str) -> None:
        """Load a list of rules from a JSON file.
        The file must contain a JSON array where each element matches the schema
        described in the user spec.
        """
        with self._global_lock:
            with open(path, "r", encoding="utf-8") as f:
                raw = json.load(f)
            self._rules = [Rule.from_dict(item) for item in raw]

    # ---------- Event processing ----------
    def process_event(self, session_id: str, event: Event) -> List[Violation]:
        """Process a single event and return any violations generated.
        Thread‑safe – internal locks protect shared state.
        """
        violations: List[Violation] = []
        now_ms = event.timestamp_ms
        for rule in self._rules:
            if not rule.enabled:
                continue
            if rule.event_type != event.event_type:
                continue

            state = self._store.get_rule_state(session_id, rule.rule_id)

            # ----- Pre‑condition: cooldown -----
            if now_ms - state["last_fired_at"] < rule.cooldown_ms:
                continue

            # ----- Condition evaluation -----
            if not self._evaluate_condition(rule, event, state):
                continue

            # ----- Post‑condition: correlation -----
            severity = rule.severity
            penalty = self._calculate_penalty(rule, state)

            # correlation check – look for any other violation within window
            recent = self._store.recent_violations(session_id, self.correlation_window_ms, now_ms)
            if any(v.rule_id != rule.rule_id for v in recent):
                # elevate severity by one level if possible
                cur_idx = self.SEVERITY_ORDER.index(severity)
                if cur_idx < len(self.SEVERITY_ORDER) - 1:
                    severity = self.SEVERITY_ORDER[cur_idx + 1]
                    # increase penalty proportionally (simple approach: +50%)
                    penalty *= 1.5

            violation = Violation(
                rule_id=rule.rule_id,
                severity=severity,
                penalty=penalty,
                timestamp_ms=now_ms,
                details={"event": event.payload},
            )
            self._store.record_violation(session_id, violation)
            violations.append(violation)

            # update rule state for next evaluations
            state["last_fired_at"] = now_ms
            state["occurrence_count"] += 1
            # keep timestamps for frequency rules
            state.setdefault("timestamps", []).append(now_ms)
        return violations

    # ---------- Condition helpers ----------
    def _evaluate_condition(self, rule: Rule, event: Event, state: Dict[str, Any]) -> bool:
        cond = rule.condition
        if cond.type == "threshold":
            value = event.payload.get("value")
            return value is not None and value > (cond.threshold or 0)
        if cond.type == "duration":
            # duration rules store accumulated time in state
            inc = event.payload.get("duration_ms", 0)
            state["accumulated_ms"] += inc
            return state["accumulated_ms"] >= (cond.threshold or 0)
        if cond.type == "frequency":
            # keep a sliding window of timestamps in state["timestamps"]
            now = event.timestamp_ms
            timestamps = state.setdefault("timestamps", [])
            timestamps.append(now)
            # purge old entries outside the window
            window = cond.window_ms or 0
            while timestamps and now - timestamps[0] > window:
                timestamps.pop(0)
            required = cond.count or 0
            return len(timestamps) >= required
        # unknown condition type – fail safe
        return False

    # ---------- Scoring ----------
    def _calculate_penalty(self, rule: Rule, state: Dict[str, Any]) -> float:
        base = rule.penalty_points
        repeat = state["occurrence_count"]  # number of previous firings
        multiplier = min(1 + repeat * 0.25, 2.5)
        return base * multiplier

    # ---------- Utility ----------
    def reset_session(self, session_id: str) -> None:
        """Clear all stored state for a session – useful for tests."""
        self._store.reset(session_id)

    def get_current_score(self, session_id: str) -> float:
        return self._store.get_score(session_id)

# End of rule_engine.py
