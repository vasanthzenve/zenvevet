package com.doctorvet.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Enterprise Circuit Breaker Service
 * Implements CLOSED, OPEN, and HALF-OPEN states with configurable failure thresholds,
 * recovery timeouts, and fallback responses to prevent cascading subsystem failures.
 */
@Service
public class CircuitBreakerService {

    private static final Logger log = LoggerFactory.getLogger(CircuitBreakerService.class);

    public enum State {
        CLOSED,     // Healthy: normal operation, executing all requests
        OPEN,       // Tripped: service failing, short-circuiting to fallback
        HALF_OPEN   // Recovering: allowing trial requests to verify recovery
    }

    public static class CircuitConfig {
        public final int failureThreshold;
        public final long recoveryTimeoutMs;
        public final int successThreshold;

        public CircuitConfig(int failureThreshold, long recoveryTimeoutMs, int successThreshold) {
            this.failureThreshold = failureThreshold;
            this.recoveryTimeoutMs = recoveryTimeoutMs;
            this.successThreshold = successThreshold;
        }

        public static CircuitConfig defaultConfig() {
            return new CircuitConfig(5, 10_000L, 2);
        }
    }

    public static class CircuitState {
        private State state = State.CLOSED;
        private int failureCount = 0;
        private int successCount = 0;
        private long lastFailureTime = 0;
        private final CircuitConfig config;

        public CircuitState(CircuitConfig config) {
            this.config = config;
        }

        public synchronized State getState() {
            if (state == State.OPEN) {
                long now = System.currentTimeMillis();
                if (now - lastFailureTime >= config.recoveryTimeoutMs) {
                    state = State.HALF_OPEN;
                    successCount = 0;
                    log.info("Circuit breaker transitioning from OPEN -> HALF_OPEN (Trial recovery period)");
                }
            }
            return state;
        }

        public synchronized void recordSuccess() {
            if (state == State.HALF_OPEN) {
                successCount++;
                if (successCount >= config.successThreshold) {
                    state = State.CLOSED;
                    failureCount = 0;
                    successCount = 0;
                    log.info("Circuit breaker recovered! Transitioning HALF_OPEN -> CLOSED");
                }
            } else if (state == State.CLOSED) {
                failureCount = 0;
            }
        }

        public synchronized void recordFailure() {
            failureCount++;
            lastFailureTime = System.currentTimeMillis();
            if (state == State.HALF_OPEN || failureCount >= config.failureThreshold) {
                state = State.OPEN;
                log.warn("Circuit breaker tripped! Transitioning -> OPEN (Failures: {})", failureCount);
            }
        }

        public synchronized void reset() {
            state = State.CLOSED;
            failureCount = 0;
            successCount = 0;
            lastFailureTime = 0;
        }

        public synchronized int getFailureCount() { return failureCount; }
    }

    private final Map<String, CircuitState> circuits = new ConcurrentHashMap<>();

    public CircuitState getCircuit(String name) {
        return circuits.computeIfAbsent(name, k -> new CircuitState(CircuitConfig.defaultConfig()));
    }

    public CircuitState getCircuit(String name, CircuitConfig config) {
        return circuits.computeIfAbsent(name, k -> new CircuitState(config));
    }

    /**
     * Execute an action protected by the named circuit breaker.
     * If the circuit is OPEN, immediately executes the fallback supplier.
     */
    public <T> T execute(String circuitName, Supplier<T> action, Supplier<T> fallback) {
        CircuitState circuit = getCircuit(circuitName);
        State currentState = circuit.getState();

        if (currentState == State.OPEN) {
            log.warn("Circuit [{}] is OPEN. Short-circuiting call to fallback.", circuitName);
            return fallback != null ? fallback.get() : null;
        }

        try {
            T result = action.get();
            circuit.recordSuccess();
            return result;
        } catch (Exception e) {
            log.error("Execution error in circuit [{}]: {}", circuitName, e.getMessage());
            circuit.recordFailure();
            return fallback != null ? fallback.get() : null;
        }
    }

    public State getState(String circuitName) {
        return getCircuit(circuitName).getState();
    }

    public void resetCircuit(String circuitName) {
        CircuitState circuit = circuits.get(circuitName);
        if (circuit != null) {
            circuit.reset();
        }
    }

    public Map<String, Object> getMetrics() {
        Map<String, Object> map = new ConcurrentHashMap<>();
        circuits.forEach((name, state) -> {
            map.put(name, Map.of(
                    "state", state.getState().name(),
                    "failures", state.getFailureCount()
            ));
        });
        return map;
    }
}

