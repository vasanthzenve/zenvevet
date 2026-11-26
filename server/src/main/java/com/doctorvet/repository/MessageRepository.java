package com.doctorvet.repository;

import com.doctorvet.model.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {

    List<Message> findByConversationIdOrderByCreatedAtAsc(Long conversationId);

    List<Message> findByConversationIdOrderByCreatedAtAscIdAsc(Long conversationId);

    Page<Message> findByConversationIdOrderByCreatedAtDescIdDesc(Long conversationId, Pageable pageable);

    Optional<Message> findByClientMsgId(String clientMsgId);

    List<Message> findByConversationIdAndSenderIdAndReceiverIdAndCreatedAtAfter(Long conversationId, Long senderId, Long receiverId, LocalDateTime after);

    List<Message> findByConversationIdAndReceiverIdAndStatus(Long conversationId, Long receiverId, String status);

    List<Message> findByReceiverIdAndStatus(Long receiverId, String status);

    long countByConversationIdAndReceiverIdAndIsReadFalse(Long conversationId, Long receiverId);

    long countByReceiverIdAndIsReadFalse(Long receiverId);
}
