package com.doctorvet.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(
    name = "campaign_unique_views",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_camp_unique_view", columnNames = {"campaignId", "userIdentifier"})
    },
    indexes = {
        @Index(name = "idx_cuv_campaign", columnList = "campaignId"),
        @Index(name = "idx_cuv_user", columnList = "userIdentifier"),
        @Index(name = "idx_cuv_created", columnList = "createdAt")
    }
)
public class CampaignUniqueView {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long campaignId;

    @Column(nullable = false, length = 128)
    private String userIdentifier;

    private Long doctorId;

    private String userIp;

    @Column(length = 500)
    private String userAgent;

    private String deviceId;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public CampaignUniqueView() {}

    public CampaignUniqueView(Long campaignId, String userIdentifier, Long doctorId, String userIp, String userAgent, String deviceId) {
        this.campaignId = campaignId;
        this.userIdentifier = userIdentifier;
        this.doctorId = doctorId;
        this.userIp = userIp;
        this.userAgent = userAgent;
        this.deviceId = deviceId;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getCampaignId() {
        return campaignId;
    }

    public void setCampaignId(Long campaignId) {
        this.campaignId = campaignId;
    }

    public String getUserIdentifier() {
        return userIdentifier;
    }

    public void setUserIdentifier(String userIdentifier) {
        this.userIdentifier = userIdentifier;
    }

    public Long getDoctorId() {
        return doctorId;
    }

    public void setDoctorId(Long doctorId) {
        this.doctorId = doctorId;
    }

    public String getUserIp() {
        return userIp;
    }

    public void setUserIp(String userIp) {
        this.userIp = userIp;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public void setUserAgent(String userAgent) {
        this.userAgent = userAgent;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
