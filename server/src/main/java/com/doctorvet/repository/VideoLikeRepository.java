package com.doctorvet.repository;

import com.doctorvet.model.VideoLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface VideoLikeRepository extends JpaRepository<VideoLike, Long> {
    Optional<VideoLike> findByVideoIdAndDoctorId(Long videoId, Long doctorId);
    List<VideoLike> findByVideoId(Long videoId);
    long countByVideoId(Long videoId);
    long countByVideoIdAndVoteType(Long videoId, String voteType);
    boolean existsByVideoIdAndDoctorId(Long videoId, Long doctorId);
    void deleteByVideoIdAndDoctorId(Long videoId, Long doctorId);
}
