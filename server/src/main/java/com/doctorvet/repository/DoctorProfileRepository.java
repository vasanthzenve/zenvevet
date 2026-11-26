package com.doctorvet.repository;

import com.doctorvet.model.DoctorProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DoctorProfileRepository extends JpaRepository<DoctorProfile, Long> {
    List<DoctorProfile> findBySpecialty(String specialty);
    List<DoctorProfile> findByState(String state);
    List<DoctorProfile> findByCityIgnoreCase(String city);
    Optional<DoctorProfile> findByEmailIgnoreCase(String email);
    Optional<DoctorProfile> findByPhone(String phone);
    List<DoctorProfile> findByPhoneContaining(String phoneDigits);

    @Query("SELECT d FROM DoctorProfile d WHERE LOWER(d.email) = LOWER(:identifier) OR d.phone = :identifier OR (d.phone IS NOT NULL AND :digits != '' AND d.phone LIKE CONCAT('%', :digits, '%'))")
    List<DoctorProfile> findByIdentifierOrPhone(@Param("identifier") String identifier, @Param("digits") String digits);
}
