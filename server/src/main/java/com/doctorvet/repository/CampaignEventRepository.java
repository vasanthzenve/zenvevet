package com.doctorvet.repository;

import com.doctorvet.model.CampaignEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface CampaignEventRepository extends JpaRepository<CampaignEvent, Long> {
    List<CampaignEvent> findByCampaignIdAndEventDateBetween(Long campaignId, LocalDate from, LocalDate to);
    List<CampaignEvent> findByCampaignIdInAndEventDateBetween(List<Long> campaignIds, LocalDate from, LocalDate to);
    long countByCampaignIdAndEventType(Long campaignId, String eventType);

    @Query("SELECT COUNT(e) > 0 FROM CampaignEvent e WHERE e.campaignId = :campaignId AND e.eventType = :eventType AND e.userIp = :userIp AND e.eventDate = :eventDate")
    boolean existsDuplicateToday(@Param("campaignId") Long campaignId,
                                 @Param("eventType") String eventType,
                                 @Param("userIp") String userIp,
                                 @Param("eventDate") LocalDate eventDate);

    @Query("SELECT COUNT(e) > 0 FROM CampaignEvent e WHERE e.campaignId = :campaignId AND e.eventType = 'CLICK' AND ((:userIp IS NOT NULL AND e.userIp = :userIp) OR (:sessionId IS NOT NULL AND e.sessionId = :sessionId)) AND e.timestamp >= :since")
    boolean existsRecentClick(@Param("campaignId") Long campaignId,
                              @Param("userIp") String userIp,
                              @Param("sessionId") String sessionId,
                              @Param("since") java.time.LocalDateTime since);
}
