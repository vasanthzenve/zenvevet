package com.doctorvet.service;

import com.doctorvet.model.Campaign;
import com.doctorvet.model.CampaignEvent;
import com.doctorvet.model.CampaignUniqueClick;
import com.doctorvet.model.CampaignUniqueView;
import com.doctorvet.repository.CampaignEventRepository;
import com.doctorvet.repository.CampaignRepository;
import com.doctorvet.repository.CampaignUniqueClickRepository;
import com.doctorvet.repository.CampaignUniqueViewRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class CampaignService {

    private static final Logger log = LoggerFactory.getLogger(CampaignService.class);

    private final CampaignRepository campaignRepo;
    private final CampaignEventRepository eventRepo;
    private final CampaignUniqueViewRepository uniqueViewRepo;
    private final CampaignUniqueClickRepository uniqueClickRepo;

    public CampaignService(CampaignRepository campaignRepo,
                           CampaignEventRepository eventRepo,
                           CampaignUniqueViewRepository uniqueViewRepo,
                           CampaignUniqueClickRepository uniqueClickRepo) {
        this.campaignRepo = campaignRepo;
        this.eventRepo = eventRepo;
        this.uniqueViewRepo = uniqueViewRepo;
        this.uniqueClickRepo = uniqueClickRepo;
    }

    public record EventTrackingResult(
            boolean success,
            boolean isNewUniqueView,
            boolean isNewUniqueClick,
            long uniqueViews,
            long uniqueClicks,
            String message
    ) {}

    public record CampaignDto(
            String title,
            String description,
            String campaignType,
            String posterUrl,
            String destinationUrl,
            String placement,
            String targetAudience,
            LocalDate startDate,
            LocalDate endDate,
            String endDateTime,
            Double dailyBudget,
            String status
    ) {}

    public record DailyMetric(
            String date,
            long views,
            long clicks
    ) {}

    public record CampaignPerformanceItem(
            Long id,
            String title,
            String status,
            String destinationUrl,
            long views,
            long clicks,
            String ctr
    ) {}

    public record ReportResult(
            long totalViews,
            long totalClicks,
            String ctr,
            List<DailyMetric> chartData,
            List<CampaignPerformanceItem> campaigns
    ) {}

    private Instant parseEndDateTime(String raw, LocalDate endDate) {
        if (raw != null && !raw.isBlank()) {
            raw = raw.trim();
            try {
                return Instant.parse(raw);
            } catch (DateTimeParseException e1) {
                try {
                    return LocalDateTime.parse(raw).atZone(ZoneId.systemDefault()).toInstant();
                } catch (Exception e2) {
                    try {
                        return OffsetDateTime.parse(raw).toInstant();
                    } catch (Exception e3) {
                        // ignore and fall back
                    }
                }
            }
        }
        if (endDate != null) {
            return endDate.atTime(23, 59, 59).atZone(ZoneId.systemDefault()).toInstant();
        }
        return null;
    }

    @Transactional
    public Campaign createCampaign(Long advertiserId, CampaignDto dto) {
        if (dto.title() == null || dto.title().isBlank()) {
            throw new IllegalArgumentException("Campaign title is required");
        }
        if (dto.destinationUrl() == null || dto.destinationUrl().isBlank()) {
            throw new IllegalArgumentException("Destination URL is required");
        }

        String destination = dto.destinationUrl().trim();
        if (!destination.startsWith("http://") && !destination.startsWith("https://")) {
            destination = "https://" + destination;
        }

        Campaign campaign = new Campaign(
                advertiserId,
                dto.title().trim(),
                dto.description(),
                dto.campaignType() != null ? dto.campaignType() : "Sponsored Post",
                dto.posterUrl(),
                destination,
                dto.placement() != null ? dto.placement() : "Feed & Clinical Cases",
                dto.targetAudience() != null ? dto.targetAudience() : "All Veterinarians",
                dto.startDate() != null ? dto.startDate() : LocalDate.now(),
                dto.endDate() != null ? dto.endDate() : LocalDate.now().plusDays(14),
                dto.dailyBudget() != null ? dto.dailyBudget() : 2500.0,
                dto.status() != null ? dto.status() : "Live"
        );
        campaign.setEndDateTime(parseEndDateTime(dto.endDateTime(), dto.endDate()));

        return campaignRepo.save(campaign);
    }

    @Transactional
    public List<Campaign> getAdvertiserCampaigns(Long advertiserId) {
        List<Campaign> campaigns = campaignRepo.findByAdvertiserIdOrderByCreatedAtDesc(advertiserId);
        for (Campaign c : campaigns) {
            if ("Live".equalsIgnoreCase(c.getStatus()) && c.isExpired()) {
                c.setStatus("Completed");
                campaignRepo.save(c);
            }
        }
        return campaigns;
    }

    public Optional<Campaign> getById(Long id) {
        return campaignRepo.findById(id);
    }

    @Transactional
    public Campaign updateCampaign(Long campaignId, Long advertiserId, CampaignDto dto) {
        Campaign campaign = campaignRepo.findById(campaignId)
                .orElseThrow(() -> new IllegalArgumentException("Campaign not found with ID: " + campaignId));

        if (!campaign.getAdvertiserId().equals(advertiserId)) {
            throw new SecurityException("Unauthorized: You do not own this campaign");
        }

        if (dto.title() != null && !dto.title().isBlank()) campaign.setTitle(dto.title().trim());
        if (dto.description() != null) campaign.setDescription(dto.description());
        if (dto.campaignType() != null) campaign.setCampaignType(dto.campaignType());
        if (dto.posterUrl() != null) campaign.setPosterUrl(dto.posterUrl());
        if (dto.destinationUrl() != null && !dto.destinationUrl().isBlank()) {
            String dest = dto.destinationUrl().trim();
            if (!dest.startsWith("http://") && !dest.startsWith("https://")) dest = "https://" + dest;
            campaign.setDestinationUrl(dest);
        }
        if (dto.placement() != null) campaign.setPlacement(dto.placement());
        if (dto.targetAudience() != null) campaign.setTargetAudience(dto.targetAudience());
        if (dto.startDate() != null) campaign.setStartDate(dto.startDate());
        if (dto.endDate() != null) campaign.setEndDate(dto.endDate());
        if (dto.endDateTime() != null) {
            campaign.setEndDateTime(parseEndDateTime(dto.endDateTime(), campaign.getEndDate()));
        }
        if (dto.dailyBudget() != null) campaign.setDailyBudget(dto.dailyBudget());
        if (dto.status() != null) campaign.setStatus(dto.status());

        return campaignRepo.save(campaign);
    }

    @Transactional
    public void deleteCampaign(Long campaignId, Long advertiserId) {
        Campaign campaign = campaignRepo.findById(campaignId)
                .orElseThrow(() -> new IllegalArgumentException("Campaign not found"));

        if (!campaign.getAdvertiserId().equals(advertiserId)) {
            throw new SecurityException("Unauthorized: You do not own this campaign");
        }

        campaignRepo.delete(campaign);
    }

    @Transactional
    public Campaign updateStatus(Long campaignId, String status) {
        Campaign campaign = campaignRepo.findById(campaignId)
                .orElseThrow(() -> new IllegalArgumentException("Campaign not found"));
        campaign.setStatus(status);
        return campaignRepo.save(campaign);
    }

    public String resolveUserIdentifier(Long doctorId, String deviceId, String userIp, String userAgent) {
        if (doctorId != null && doctorId > 0) {
            return "doc:" + doctorId;
        }
        if (deviceId != null && !deviceId.isBlank() && !deviceId.equalsIgnoreCase("null") && !deviceId.equalsIgnoreCase("undefined")) {
            String cleanDevice = deviceId.trim();
            if (cleanDevice.length() > 64) cleanDevice = cleanDevice.substring(0, 64);
            return "dev:" + cleanDevice;
        }
        // Privacy-compliant fallback hash based on IP and User-Agent
        String ipPart = (userIp != null && !userIp.isBlank()) ? userIp.trim() : "127.0.0.1";
        String uaPart = (userAgent != null && !userAgent.isBlank()) ? userAgent.trim() : "unknown";
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest((ipPart + "::" + uaPart).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return "anon:" + hexString.substring(0, 24);
        } catch (Exception e) {
            return "anon:" + Math.abs((ipPart + uaPart).hashCode());
        }
    }

    @Transactional
    public void recordEvent(Long campaignId, String eventType, String userIp, String sessionId, String userAgent) {
        recordEvent(campaignId, eventType, null, null, userIp, sessionId, userAgent);
    }

    @Transactional
    public EventTrackingResult recordEvent(
            Long campaignId,
            String eventType,
            Long doctorId,
            String deviceId,
            String userIp,
            String sessionId,
            String userAgent
    ) {
        Campaign campaign = campaignRepo.findById(campaignId).orElse(null);
        if (campaign == null) {
            return new EventTrackingResult(false, false, false, 0, 0, "Campaign not found");
        }

        // Verify campaign is active (Live or Active) and not disabled
        boolean isLiveOrActive = "Live".equalsIgnoreCase(campaign.getStatus()) || "Active".equalsIgnoreCase(campaign.getStatus());
        if (!isLiveOrActive) {
            log.info("[CampaignService] Ignored event for non-active campaign {} (status: {})", campaignId, campaign.getStatus());
            return new EventTrackingResult(false, false, false, campaign.getViewsCount(), campaign.getClicksCount(), "Campaign not active");
        }

        // Verify campaign has not expired
        if (campaign.isExpired()) {
            log.info("[CampaignService] Ignored event for expired campaign {} (endDate: {}, endDateTime: {})", campaignId, campaign.getEndDate(), campaign.getEndDateTime());
            return new EventTrackingResult(false, false, false, campaign.getViewsCount(), campaign.getClicksCount(), "Campaign expired");
        }

        String type = "CLICK".equalsIgnoreCase(eventType) ? "CLICK" : "VIEW";
        String userIdentifier = resolveUserIdentifier(doctorId, deviceId, userIp, userAgent);

        boolean isNewUniqueView = false;
        boolean isNewUniqueClick = false;

        if ("VIEW".equals(type)) {
            // Check if user has already viewed this advertisement (1 unique view per user per ad)
            if (!uniqueViewRepo.existsByCampaignIdAndUserIdentifier(campaignId, userIdentifier)) {
                try {
                    CampaignUniqueView view = new CampaignUniqueView(
                            campaignId,
                            userIdentifier,
                            doctorId,
                            userIp,
                            userAgent != null && userAgent.length() > 500 ? userAgent.substring(0, 500) : userAgent,
                            deviceId
                    );
                    uniqueViewRepo.saveAndFlush(view);
                    isNewUniqueView = true;
                } catch (DataIntegrityViolationException dive) {
                    // Handled concurrent insertion gracefully: unique constraint caught duplicate view
                    log.debug("[CampaignService] Duplicate view caught by unique constraint for campaign {} and user {}", campaignId, userIdentifier);
                } catch (Exception e) {
                    log.warn("[CampaignService] Failed to record unique view: {}", e.getMessage());
                }
            }
        } else if ("CLICK".equals(type)) {
            // Check if user has already clicked this advertisement (1 unique click per user per ad)
            if (!uniqueClickRepo.existsByCampaignIdAndUserIdentifier(campaignId, userIdentifier)) {
                try {
                    CampaignUniqueClick click = new CampaignUniqueClick(
                            campaignId,
                            userIdentifier,
                            doctorId,
                            userIp,
                            userAgent != null && userAgent.length() > 500 ? userAgent.substring(0, 500) : userAgent,
                            deviceId
                    );
                    uniqueClickRepo.saveAndFlush(click);
                    isNewUniqueClick = true;
                } catch (DataIntegrityViolationException dive) {
                    // Handled concurrent click gracefully: unique constraint caught duplicate click
                    log.debug("[CampaignService] Duplicate click caught by unique constraint for campaign {} and user {}", campaignId, userIdentifier);
                } catch (Exception e) {
                    log.warn("[CampaignService] Failed to record unique click: {}", e.getMessage());
                }
            }
        }

        // Also record raw event in historical audit log
        try {
            CampaignEvent event = new CampaignEvent(campaignId, type, userIp, sessionId, userAgent, LocalDate.now());
            eventRepo.save(event);
        } catch (Exception ignored) {}

        // Authoritative unique counts directly synchronized from database unique tables
        long actualUniqueViews = uniqueViewRepo.countByCampaignId(campaignId);
        long actualUniqueClicks = uniqueClickRepo.countByCampaignId(campaignId);

        campaign.setViewsCount(actualUniqueViews);
        campaign.setClicksCount(actualUniqueClicks);
        campaignRepo.save(campaign);

        return new EventTrackingResult(true, isNewUniqueView, isNewUniqueClick, actualUniqueViews, actualUniqueClicks, "Recorded");
    }

    public ReportResult getReports(Long advertiserId, String preset, LocalDate customFrom, LocalDate customTo) {
        List<Campaign> campaigns = campaignRepo.findByAdvertiserIdOrderByCreatedAtDesc(advertiserId);
        if (campaigns.isEmpty()) {
            return new ReportResult(0, 0, "0.00%", Collections.emptyList(), Collections.emptyList());
        }

        LocalDate today = LocalDate.now();
        LocalDate fromDate = customFrom != null ? customFrom : today.minusDays(6);
        LocalDate toDate = customTo != null ? customTo : today;

        if (preset != null) {
            switch (preset.trim().toLowerCase()) {
                case "today" -> {
                    fromDate = today;
                    toDate = today;
                }
                case "last 7 days", "7days" -> {
                    fromDate = today.minusDays(6);
                    toDate = today;
                }
                case "last 30 days", "30days" -> {
                    fromDate = today.minusDays(29);
                    toDate = today;
                }
                case "this month", "month" -> {
                    fromDate = today.withDayOfMonth(1);
                    toDate = today;
                }
            }
        }

        List<Long> campaignIds = campaigns.stream().map(Campaign::getId).toList();
        LocalDateTime rangeStart = fromDate.atStartOfDay();
        LocalDateTime rangeEnd = toDate.atTime(23, 59, 59);

        List<CampaignUniqueView> uniqueViewsList = uniqueViewRepo.findByCampaignIdInAndCreatedAtBetween(campaignIds, rangeStart, rangeEnd);
        List<CampaignUniqueClick> uniqueClicksList = uniqueClickRepo.findByCampaignIdInAndCreatedAtBetween(campaignIds, rangeStart, rangeEnd);

        long totalViews = uniqueViewsList.size();
        long totalClicks = uniqueClicksList.size();

        // If no events in the selected date range yet, fallback to all-time unique counters on the campaigns
        if (totalViews == 0 && totalClicks == 0) {
            totalViews = campaigns.stream().mapToLong(Campaign::getViewsCount).sum();
            totalClicks = campaigns.stream().mapToLong(Campaign::getClicksCount).sum();
        }

        String ctr = totalViews > 0 ? String.format(Locale.US, "%.2f%%", ((double) totalClicks / totalViews) * 100.0) : "0.00%";

        // Build daily chart metrics based on unique user events
        List<DailyMetric> chartData = new ArrayList<>();
        long daysBetween = ChronoUnit.DAYS.between(fromDate, toDate);
        if (daysBetween < 0) daysBetween = 0;
        if (daysBetween > 90) daysBetween = 90;

        for (int i = 0; i <= daysBetween; i++) {
            LocalDate d = fromDate.plusDays(i);
            long dViews = uniqueViewsList.stream().filter(v -> v.getCreatedAt().toLocalDate().equals(d)).count();
            long dClicks = uniqueClicksList.stream().filter(c -> c.getCreatedAt().toLocalDate().equals(d)).count();
            chartData.add(new DailyMetric(d.toString(), dViews, dClicks));
        }

        // Per-campaign unique performance
        Map<Long, List<CampaignUniqueView>> viewsByCampaign = uniqueViewsList.stream().collect(Collectors.groupingBy(CampaignUniqueView::getCampaignId));
        Map<Long, List<CampaignUniqueClick>> clicksByCampaign = uniqueClicksList.stream().collect(Collectors.groupingBy(CampaignUniqueClick::getCampaignId));
        List<CampaignPerformanceItem> perfList = new ArrayList<>();

        for (Campaign c : campaigns) {
            long cViews = viewsByCampaign.getOrDefault(c.getId(), Collections.emptyList()).size();
            long cClicks = clicksByCampaign.getOrDefault(c.getId(), Collections.emptyList()).size();

            if (cViews == 0 && cClicks == 0) {
                cViews = c.getViewsCount();
                cClicks = c.getClicksCount();
            }

            String cCtr = cViews > 0 ? String.format(Locale.US, "%.2f%%", ((double) cClicks / cViews) * 100.0) : "0.00%";
            perfList.add(new CampaignPerformanceItem(c.getId(), c.getTitle(), c.getStatus(), c.getDestinationUrl(), cViews, cClicks, cCtr));
        }

        return new ReportResult(totalViews, totalClicks, ctr, chartData, perfList);
    }

    public String generateCsv(Long advertiserId, LocalDate from, LocalDate to) {
        ReportResult reports = getReports(advertiserId, null, from, to);

        StringBuilder sb = new StringBuilder();
        sb.append("Campaign ID,Campaign Title,Status,Destination URL,Views,Clicks,CTR\n");

        for (CampaignPerformanceItem item : reports.campaigns()) {
            sb.append(item.id()).append(",")
              .append("\"").append(item.title().replace("\"", "\"\"")).append("\",")
              .append(item.status()).append(",")
              .append("\"").append(item.destinationUrl().replace("\"", "\"\"")).append("\",")
              .append(item.views()).append(",")
              .append(item.clicks()).append(",")
              .append(item.ctr()).append("\n");
        }

        return sb.toString();
    }

    @Transactional
    public List<Campaign> getPublicLiveCampaigns(String placement) {
        List<Campaign> live = campaignRepo.findByStatusIgnoreCase("Live");
        List<Campaign> activeLive = new ArrayList<>();

        for (Campaign c : live) {
            if (c.isExpired()) {
                // Auto-expire from live feed, but retain in database as Completed for advertiser history!
                c.setStatus("Completed");
                campaignRepo.save(c);
            } else {
                if (placement == null || placement.isBlank()
                        || c.getPlacement().toLowerCase().contains(placement.toLowerCase())
                        || placement.toLowerCase().contains(c.getPlacement().toLowerCase())) {
                    activeLive.add(c);
                }
            }
        }

        return activeLive;
    }
}
