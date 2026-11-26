package com.doctorvet.repository;

import com.doctorvet.model.ShortVideo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface ShortVideoRepository extends JpaRepository<ShortVideo, Long> {

    Optional<ShortVideo> findByIdempotencyKey(String idempotencyKey);

    List<ShortVideo> findByDoctorNameAndCreatedAtAfter(String doctorName, LocalDateTime after);
}
