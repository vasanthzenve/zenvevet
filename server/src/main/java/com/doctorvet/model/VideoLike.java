package com.doctorvet.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "video_likes",
       uniqueConstraints = @UniqueConstraint(columnNames = {"videoId", "doctorId"}))
public class VideoLike {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long videoId;

    @Column(nullable = false)
    private Long doctorId;

    @Column(length = 20, nullable = false)
    private String voteType = "LIKE"; // "LIKE" or "DISLIKE"

    @Column(length = 50)
    private String reaction;

    private LocalDateTime createdAt = LocalDateTime.now();

    public VideoLike() {}

    public VideoLike(Long videoId, Long doctorId) {
        this.videoId = videoId;
        this.doctorId = doctorId;
        this.voteType = "LIKE";
        this.reaction = "like_puppy";
        this.createdAt = LocalDateTime.now();
    }

    public VideoLike(Long videoId, Long doctorId, String voteType, String reaction) {
        this.videoId = videoId;
        this.doctorId = doctorId;
        this.voteType = (voteType != null && !voteType.isBlank()) ? voteType.toUpperCase() : "LIKE";
        this.reaction = reaction;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getVideoId() { return videoId; }
    public void setVideoId(Long videoId) { this.videoId = videoId; }

    public Long getDoctorId() { return doctorId; }
    public void setDoctorId(Long doctorId) { this.doctorId = doctorId; }

    public String getVoteType() { return voteType != null ? voteType : "LIKE"; }
    public void setVoteType(String voteType) { this.voteType = (voteType != null && !voteType.isBlank()) ? voteType.toUpperCase() : "LIKE"; }

    public String getReaction() { return reaction; }
    public void setReaction(String reaction) { this.reaction = reaction; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
