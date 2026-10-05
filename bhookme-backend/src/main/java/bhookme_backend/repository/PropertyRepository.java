package bhookme_backend.repository;

import bhookme_backend.model.Property;
import bhookme_backend.model.PropertyCategory;
import bhookme_backend.model.PropertyStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PropertyRepository extends JpaRepository<Property, Long> {

    List<Property> findByStatus(PropertyStatus status);

    List<Property> findByCityAndStatus(String city, PropertyStatus status);

    List<Property> findByHostId(Long hostId);

    List<Property> findByCategoryAndStatus(PropertyCategory category, PropertyStatus status);

    // ============================================================
    // NEAREST PROPERTIES (Haversine formula, in miles)
    // ------------------------------------------------------------
    // Powers the homepage's first section: "properties closest to
    // the searching user's location". Only considers ACTIVE
    // properties.
    // ============================================================
    @Query(value =
        "SELECT p.*, " +
        "(3959 * ACOS(COS(RADIANS(:lat)) * COS(RADIANS(p.latitude)) * " +
        "COS(RADIANS(p.longitude) - RADIANS(:lng)) + " +
        "SIN(RADIANS(:lat)) * SIN(RADIANS(p.latitude)))) AS distance_miles " +
        "FROM properties p " +
        "WHERE p.status = 'ACTIVE' " +
        "HAVING distance_miles IS NOT NULL " +
        "ORDER BY distance_miles ASC",
        countQuery = "SELECT COUNT(*) FROM properties WHERE status = 'ACTIVE'",
        nativeQuery = true)
    List<Property> findNearestActiveProperties(@Param("lat") double latitude,
                                                @Param("lng") double longitude,
                                                Pageable pageable);
}
