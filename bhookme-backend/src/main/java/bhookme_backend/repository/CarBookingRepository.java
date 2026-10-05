package bhookme_backend.repository;

import bhookme_backend.model.BookingStatus;
import bhookme_backend.model.CarBooking;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface CarBookingRepository extends JpaRepository<CarBooking, Long> {

    List<CarBooking> findByGuestId(Long guestId);

    // Every car booking made on any car owned by this host - powers
    // the host dashboard's unified Bookings tab.
    List<CarBooking> findByCar_Host_Id(Long hostId);

    // ============================================================
    // AVAILABILITY CHECK (v1 - status-based)
    // ------------------------------------------------------------
    // Returns any booking on this car with the given status that
    // overlaps the requested range. Kept for reference / other uses.
    // ============================================================
    @Query("SELECT cb FROM CarBooking cb " +
           "WHERE cb.car.id = :carId " +
           "AND cb.status = :status " +
           "AND cb.startDate < :endDate " +
           "AND cb.endDate > :startDate")
    List<CarBooking> findOverlappingBookings(@Param("carId") Long carId,
                                              @Param("startDate") LocalDate startDate,
                                              @Param("endDate") LocalDate endDate,
                                              @Param("status") BookingStatus status);

    // ============================================================
    // BLOCKING BOOKINGS (v2 rule: paid + confirmed)
    // ------------------------------------------------------------
    // Same overlap logic as findOverlappingBookings, but filtered to
    // paid+confirmed bookings only. PENDING or unpaid bookings block
    // nothing, so multiple guests can request the same dates.
    // ============================================================
    @Query("SELECT cb FROM CarBooking cb " +
           "WHERE cb.car.id = :carId " +
           "AND cb.paid = true " +
           "AND cb.status = bhookme_backend.model.BookingStatus.CONFIRMED " +
           "AND cb.startDate < :endDate " +
           "AND cb.endDate > :startDate")
    List<CarBooking> findBlockingBookings(@Param("carId") Long carId,
                                           @Param("startDate") LocalDate startDate,
                                           @Param("endDate") LocalDate endDate);

    // ============================================================
    // ALL BLOCKING BOOKINGS for a car (no date window)
    // ------------------------------------------------------------
    // Used by GET /api/cars/{id}/blocked-dates to feed the guest
    // date picker. Returns every paid+confirmed booking for the car,
    // so the picker can strike through all of them at once.
    // ============================================================
    @Query("SELECT cb FROM CarBooking cb " +
           "WHERE cb.car.id = :carId " +
           "AND cb.paid = true " +
           "AND cb.status = bhookme_backend.model.BookingStatus.CONFIRMED")
    List<CarBooking> findAllBlockingForCar(@Param("carId") Long carId);
}