package bhookme_backend.repository;

import bhookme_backend.model.Booking;
import bhookme_backend.model.BookingStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface BookingRepository extends JpaRepository<Booking, Long> {

    List<Booking> findByGuestId(Long guestId);

    List<Booking> findByPropertyId(Long propertyId);

    // Every booking made on any property owned by this host - powers
    // the host dashboard's Bookings and Earnings tabs.
    List<Booking> findByProperty_Host_Id(Long hostId);

    // ============================================================
    // AVAILABILITY CHECK (v1 approach, no separate calendar table)
    // ------------------------------------------------------------
    // Returns any CONFIRMED booking on this property whose date
    // range overlaps the requested check-in/check-out. An empty
    // result means the property is available for those dates.
    // ============================================================
    @Query("SELECT b FROM Booking b " +
           "WHERE b.property.id = :propertyId " +
           "AND b.status = :status " +
           "AND b.checkInDate < :checkOutDate " +
           "AND b.checkOutDate > :checkInDate")
    List<Booking> findOverlappingBookings(@Param("propertyId") Long propertyId,
                                           @Param("checkInDate") LocalDate checkInDate,
                                           @Param("checkOutDate") LocalDate checkOutDate,
                                           @Param("status") BookingStatus status);

    // ============================================================
    // BLOCKING BOOKINGS (v2 rule: paid + confirmed)
    // ------------------------------------------------------------
    // A booking blocks its dates only when BOTH:
    //   - paid = true
    //   - status = CONFIRMED
    // PENDING and unpaid bookings block nothing.
    //
    // Two variants:
    //  - findBlockingBookings: overlap check for a requested range
    //  - findBlockingBookingsForProperty: every blocking booking on
    //    the property, used to feed the guest date picker so it can
    //    strike the dates out.
    // ============================================================
    @Query("SELECT b FROM Booking b " +
           "WHERE b.property.id = :propertyId " +
           "AND b.paid = true " +
           "AND b.status = bhookme_backend.model.BookingStatus.CONFIRMED " +
           "AND b.checkInDate < :checkOutDate " +
           "AND b.checkOutDate > :checkInDate")
    List<Booking> findBlockingBookings(@Param("propertyId") Long propertyId,
                                        @Param("checkInDate") LocalDate checkInDate,
                                        @Param("checkOutDate") LocalDate checkOutDate);

    @Query("SELECT b FROM Booking b " +
           "WHERE b.property.id = :propertyId " +
           "AND b.paid = true " +
           "AND b.status = bhookme_backend.model.BookingStatus.CONFIRMED")
    List<Booking> findBlockingBookingsForProperty(@Param("propertyId") Long propertyId);
}