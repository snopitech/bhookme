package bhookme_backend.repository;

import bhookme_backend.model.ApplicationStatus;
import bhookme_backend.model.HostApplication;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface HostApplicationRepository extends JpaRepository<HostApplication, Long> {
    Optional<HostApplication> findTopByUser_IdOrderByCreatedAtDesc(Long userId);
    List<HostApplication> findByStatusOrderByCreatedAtAsc(ApplicationStatus status);
    List<HostApplication> findAllByOrderByCreatedAtDesc();
}