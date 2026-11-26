package com.doctorvet.repository;

import com.doctorvet.model.Post;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface PostRepository extends JpaRepository<Post, Long> {
    List<Post> findByPostType(String postType);

    List<Post> findByCaseId(Long caseId);

    List<Post> findByVideoId(Long videoId);

    List<Post> findAllByOrderByCreatedAtDesc();

    Optional<Post> findByIdempotencyKey(String idempotencyKey);

    List<Post> findByAuthorIdAndCreatedAtAfter(Long authorId, LocalDateTime after);

    List<Post> findByAuthorNameAndCreatedAtAfter(String authorName, LocalDateTime after);
}
