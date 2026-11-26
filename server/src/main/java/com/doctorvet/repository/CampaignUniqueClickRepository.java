package com.doctorvet.repository;

import com.doctorvet.model.CampaignUniqueClick;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface CampaignUniqueClickRepository extends JpaRepository<CampaignUniqueClick, Long> {
    boolean existsByCampaignIdAndUserIdentifier(Long campaignId, String userIdentifier);

    long countByCampaignId(Long campaignId);

    Optional<CampaignUniqueClick> findByCampaignIdAndUserIdentifier(Long campaignId, String userIdentifier);

    List<CampaignUniqueClick> findByCampaignIdInAndCreatedAtBetween(List<Long> campaignIds, LocalDateTime from, LocalDateTime to);

    @Query("SELECT COUNT(c) FROM CampaignUniqueClick c WHERE c.campaignId = :campaignId")
    long countUniqueClicks(@Param("campaignId") Long campaignId);
}
