package com.doctorvet.repository;

import com.doctorvet.model.PaymentTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentTransactionRepository extends JpaRepository<PaymentTransaction, Long> {
    Optional<PaymentTransaction> findByTransactionId(String transactionId);
    Optional<PaymentTransaction> findByOrderId(String orderId);
    Optional<PaymentTransaction> findByIdempotencyKey(String idempotencyKey);
    List<PaymentTransaction> findByUserIdAndUserTypeOrderByCreatedAtDesc(Long userId, String userType);
}

