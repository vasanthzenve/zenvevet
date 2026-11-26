package com.doctorvet.repository;

import com.doctorvet.model.ClinicalCase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface ClinicalCaseRepository extends JpaRepository<ClinicalCase, Long> {
    List<ClinicalCase> findBySpecies(String species);
    List<ClinicalCase> findByAuthorSpecialty(String authorSpecialty);
    Optional<ClinicalCase> findByIdempotencyKey(String idempotencyKey);
    List<ClinicalCase> findByAuthorNameAndCreatedAtAfter(String authorName, LocalDateTime after);
}
