package com.doctorvet.repository;

import com.doctorvet.model.CampaignUniqueView;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface CampaignUniqueViewRepository extends JpaRepository<CampaignUniqueView, Long> {
    boolean existsByCampaignIdAndUserIdentifier(Long campaignId, String userIdentifier);

    long countByCampaignId(Long campaignId);

    Optional<CampaignUniqueView> findByCampaignIdAndUserIdentifier(Long campaignId, String userIdentifier);

    List<CampaignUniqueView> findByCampaignIdInAndCreatedAtBetween(List<Long> campaignIds, LocalDateTime from, LocalDateTime to);

    @Query("SELECT COUNT(v) FROM CampaignUniqueView v WHERE v.campaignId = :campaignId")
    long countUniqueViews(@Param("campaignId") Long campaignId);
}
