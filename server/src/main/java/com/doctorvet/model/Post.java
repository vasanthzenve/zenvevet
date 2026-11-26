package com.doctorvet.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "posts", indexes = {
    @Index(name = "idx_posts_author_created", columnList = "authorId, createdAt"),
    @Index(name = "idx_posts_idempotency", columnList = "idempotencyKey")
})
public class Post {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long authorId;
    private String authorName;
    private String authorSpecialty;
    private String authorCity;
    private String authorAvatar;

    private String postType;
    private String badgeLabel;
    private Long caseId;
    private Long videoId;

    @Column(length = 4000, nullable = false)
    private String content;

    private String imageUrl;
    private String videoUrl;
    private String species;
    private Integer likes = 0;
    private Integer dislikes = 0;
    private Integer commentsCount = 0;
    private Integer shares = 0;

    @Column(length = 128)
    private String idempotencyKey;

    @Transient
    private Boolean isLiked = false;

    @Transient
    private Boolean isDisliked = false;

    @Transient
    private String userReaction = null;

    private LocalDateTime createdAt = LocalDateTime.now();

    public Post() {
    }

    public Post(String authorName, String authorSpecialty, String authorCity, String authorAvatar,
            String postType, String badgeLabel, String content, String imageUrl, String species, int likes) {
        this.authorName = authorName;
        this.authorSpecialty = authorSpecialty;
        this.authorCity = authorCity;
        this.authorAvatar = authorAvatar;
        this.postType = postType;
        this.badgeLabel = badgeLabel;
        this.content = content;
        this.imageUrl = imageUrl;
        this.species = species;
        this.likes = likes;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getAuthorId() {
        return authorId;
    }

    public void setAuthorId(Long authorId) {
        this.authorId = authorId;
    }

    public String getAuthorName() {
        return authorName;
    }

    public void setAuthorName(String authorName) {
        this.authorName = authorName;
    }

    public String getAuthorSpecialty() {
        return authorSpecialty;
    }

    public void setAuthorSpecialty(String authorSpecialty) {
        this.authorSpecialty = authorSpecialty;
    }

    public String getAuthorCity() {
        return authorCity;
    }

    public void setAuthorCity(String authorCity) {
        this.authorCity = authorCity;
    }

    public String getAuthorAvatar() {
        return authorAvatar;
    }

    public void setAuthorAvatar(String authorAvatar) {
        this.authorAvatar = authorAvatar;
    }

    public String getPostType() {
        return postType;
    }

    public void setPostType(String postType) {
        this.postType = postType;
    }

    public String getBadgeLabel() {
        return badgeLabel;
    }

    public void setBadgeLabel(String badgeLabel) {
        this.badgeLabel = badgeLabel;
    }

    public Long getCaseId() {
        return caseId;
    }

    public void setCaseId(Long caseId) {
        this.caseId = caseId;
    }

    public Long getVideoId() {
        return videoId;
    }

    public void setVideoId(Long videoId) {
        this.videoId = videoId;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public String getVideoUrl() {
        return videoUrl;
    }

    public void setVideoUrl(String videoUrl) {
        this.videoUrl = videoUrl;
    }

    public String getSpecies() {
        return species;
    }

    public void setSpecies(String species) {
        this.species = species;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public void setIdempotencyKey(String idempotencyKey) {
        this.idempotencyKey = idempotencyKey;
    }

    public int getLikes() {
        return likes != null ? likes : 0;
    }

    public void setLikes(Integer likes) {
        this.likes = likes != null ? likes : 0;
    }

    public int getCommentsCount() {
        return commentsCount != null ? commentsCount : 0;
    }

    public void setCommentsCount(Integer commentsCount) {
        this.commentsCount = commentsCount != null ? commentsCount : 0;
    }

    public int getShares() {
        return shares != null ? shares : 0;
    }

    public void setShares(Integer shares) {
        this.shares = shares != null ? shares : 0;
    }

    public Boolean getIsLiked() {
        return isLiked != null ? isLiked : false;
    }

    public void setIsLiked(Boolean isLiked) {
        this.isLiked = isLiked != null ? isLiked : false;
    }

    public int getDislikes() {
        return dislikes != null ? dislikes : 0;
    }

    public void setDislikes(Integer dislikes) {
        this.dislikes = dislikes != null ? dislikes : 0;
    }

    public Boolean getIsDisliked() {
        return isDisliked != null ? isDisliked : false;
    }

    public void setIsDisliked(Boolean isDisliked) {
        this.isDisliked = isDisliked != null ? isDisliked : false;
    }

    public String getUserReaction() {
        return userReaction;
    }

    public void setUserReaction(String userReaction) {
        this.userReaction = userReaction;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
