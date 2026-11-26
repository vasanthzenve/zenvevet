package com.doctorvet.repository;

import com.doctorvet.model.CaseLike;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface CaseLikeRepository extends JpaRepository<CaseLike, Long> {
    Optional<CaseLike> findByCaseIdAndDoctorId(Long caseId, Long doctorId);
    long countByCaseId(Long caseId);
    long countByCaseIdAndVoteType(Long caseId, String voteType);
    List<CaseLike> findByDoctorId(Long doctorId);
    List<CaseLike> findByCaseId(Long caseId);
    List<CaseLike> findByCaseIdAndVoteType(Long caseId, String voteType);
    void deleteByCaseId(Long caseId);
}
