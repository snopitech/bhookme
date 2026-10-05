package bhookme_backend.service;

import bhookme_backend.dto.CarBookingCreateRequest;
import bhookme_backend.dto.CarBookingResponse;
import bhookme_backend.dto.CarQuoteResponse;
import bhookme_backend.model.BookingStatus;
import bhookme_backend.model.Car;
import bhookme_backend.model.CarBooking;
import bhookme_backend.model.CarStatus;
import bhookme_backend.model.User;
import bhookme_backend.repository.CarBookingRepository;
import bhookme_backend.repository.CarRepository;
import bhookme_backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class CarBookingService {

    private static final int MAX_DAYS = 30;

    private final CarBookingRepository carBookingRepository;
    private final CarRepository carRepository;
    private final UserRepository userRepository;
    private final EmailService emailService;

    public CarBookingService(CarBookingRepository carBookingRepository,
                              CarRepository carRepository,
                              UserRepository userRepository,
                              EmailService emailService) {
        this.carBookingRepository = carBookingRepository;
        this.carRepository = carRepository;
        this.userRepository = userRepository;
        this.emailService = emailService;
    }

    @Transactional(readOnly = true)
    public CarQuoteResponse getQuote(Long carId, LocalDate startDate, LocalDate endDate) {
        Car car = findCar(carId);
        CarQuoteResponse quote = new CarQuoteResponse();

        String problem = validateStay(car, startDate, endDate);
        if (problem != null) {
            quote.setAvailable(false);
            quote.setMessage(problem);
            return quote;
        }

        int days = (int) ChronoUnit.DAYS.between(startDate, endDate);
        BigDecimal total = car.getDailyRate().multiply(BigDecimal.valueOf(days)).setScale(2, RoundingMode.HALF_UP);

        quote.setAvailable(true);
        quote.setTotalDays(days);
        quote.setDailyRate(car.getDailyRate());
        quote.setTotalPrice(total);
        return quote;
    }

    @Transactional
    public CarBookingResponse createBooking(String email, CarBookingCreateRequest request) {
        User guest = findUser(email);

        if (request.getCarId() == null) {
            throw new RuntimeException("Car is required");
        }
        Car car = findCar(request.getCarId());

        if (guest.getDateOfBirth() == null) {
            throw new RuntimeException("Please complete your profile (date of birth) before booking");
        }
        if (car.getHost().getId().equals(guest.getId())) {
            throw new RuntimeException("You cannot rent your own car listing");
        }

        String problem = validateStay(car, request.getStartDate(), request.getEndDate());
        if (problem != null) {
            throw new RuntimeException(problem);
        }

        int days = (int) ChronoUnit.DAYS.between(request.getStartDate(), request.getEndDate());
        BigDecimal total = car.getDailyRate().multiply(BigDecimal.valueOf(days)).setScale(2, RoundingMode.HALF_UP);

        CarBooking booking = new CarBooking();
        booking.setCar(car);
        booking.setGuest(guest);
        booking.setStartDate(request.getStartDate());
        booking.setEndDate(request.getEndDate());
        booking.setDailyRateSnapshot(car.getDailyRate());
        booking.setTotalDays(days);
        booking.setTotalPrice(total);
        booking.setStatus(BookingStatus.PENDING);
        booking.setPaid(false);

        return toResponse(carBookingRepository.save(booking));
    }

    @Transactional(readOnly = true)
    public List<CarBookingResponse> getMyBookings(String email) {
        User guest = findUser(email);
        return carBookingRepository.findByGuestId(guest.getId()).stream()
                .sorted(Comparator.comparing(CarBooking::getStartDate).reversed())
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<CarBookingResponse> getHostBookings(String hostEmail) {
        User host = findUser(hostEmail);
        return carBookingRepository.findByCar_Host_Id(host.getId()).stream()
                .sorted(Comparator.comparing(CarBooking::getCreatedAt).reversed())
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<Map<String, String>> getBlockedDates(Long carId) {
        findCar(carId);
        return carBookingRepository.findAllBlockingForCar(carId).stream()
                .map(b -> {
                    Map<String, String> m = new HashMap<>();
                    m.put("startDate", b.getStartDate().toString());
                    m.put("endDate", b.getEndDate().toString());
                    return m;
                })
                .collect(Collectors.toList());
    }

    @Transactional
    public CarBookingResponse cancelBooking(String email, Long bookingId) {
        User guest = findUser(email);
        CarBooking booking = carBookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Booking not found"));

        if (!booking.getGuest().getId().equals(guest.getId())) {
            throw new RuntimeException("You can only cancel your own bookings");
        }
        if (booking.getStatus() == BookingStatus.CANCELLED) {
            return toResponse(booking);
        }
        if (booking.getStatus() == BookingStatus.COMPLETED
                || booking.getStartDate().isBefore(LocalDate.now())) {
            throw new RuntimeException("This booking can no longer be cancelled");
        }

        booking.setStatus(BookingStatus.CANCELLED);
        return toResponse(carBookingRepository.save(booking));
    }

    // ------------------------------------------------------------
    // Host actions: mark paid, confirm, decline
    // ------------------------------------------------------------

    @Transactional
    public CarBookingResponse setBookingPaid(String hostEmail, Long bookingId, boolean paid) {
        User host = findUser(hostEmail);
        CarBooking booking = carBookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Booking not found"));

        if (!booking.getCar().getHost().getId().equals(host.getId())) {
            throw new RuntimeException("You can only manage bookings on your own listings");
        }
        if (booking.getStatus() == BookingStatus.CANCELLED) {
            throw new RuntimeException("This booking was cancelled and can't be marked paid");
        }
        if (booking.getStatus() == BookingStatus.COMPLETED) {
            throw new RuntimeException("This booking is already completed");
        }

        boolean wasPaid = Boolean.TRUE.equals(booking.getPaid());
        booking.setPaid(paid);
        CarBooking saved = carBookingRepository.save(booking);

        if (!wasPaid && paid) {
            try {
                emailService.sendBookingPaidEmail(
                        booking.getGuest().getEmail(),
                        booking.getGuest().getFirstName(),
                        carLabel(booking.getCar()),
                        booking.getStartDate(),
                        booking.getEndDate(),
                        booking.getTotalPrice()
                );
            } catch (Exception e) {
                System.err.println("[CarBooking] Failed to send paid email to "
                        + booking.getGuest().getEmail() + ": " + e.getMessage());
            }
        }

        return toResponse(saved);
    }

    @Transactional
    public CarBookingResponse setBookingConfirmed(String hostEmail, Long bookingId, String targetStatus) {
        User host = findUser(hostEmail);
        CarBooking booking = carBookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Booking not found"));

        if (!booking.getCar().getHost().getId().equals(host.getId())) {
            throw new RuntimeException("You can only manage bookings on your own listings");
        }
        if (booking.getStatus() == BookingStatus.CANCELLED) {
            throw new RuntimeException("This booking was cancelled and can't be re-confirmed");
        }
        if (booking.getStatus() == BookingStatus.COMPLETED) {
            throw new RuntimeException("This booking is already completed");
        }

        BookingStatus previous = booking.getStatus();

        if ("CONFIRMED".equalsIgnoreCase(targetStatus)) {
            if (!Boolean.TRUE.equals(booking.getPaid())) {
                throw new RuntimeException("Mark the booking as paid before confirming it");
            }
            booking.setStatus(BookingStatus.CONFIRMED);
        } else if ("PENDING".equalsIgnoreCase(targetStatus)) {
            booking.setStatus(BookingStatus.PENDING);
        } else {
            throw new RuntimeException("Status must be CONFIRMED or PENDING");
        }

        CarBooking saved = carBookingRepository.save(booking);

        if (previous != BookingStatus.CONFIRMED && booking.getStatus() == BookingStatus.CONFIRMED) {
            try {
                emailService.sendBookingConfirmedEmail(
                        booking.getGuest().getEmail(),
                        booking.getGuest().getFirstName(),
                        carLabel(booking.getCar()),
                        booking.getStartDate(),
                        booking.getEndDate(),
                        booking.getTotalPrice()
                );
            } catch (Exception e) {
                System.err.println("[CarBooking] Failed to send confirmed email to "
                        + booking.getGuest().getEmail() + ": " + e.getMessage());
            }
        }

        return toResponse(saved);
    }

    @Transactional
    public CarBookingResponse declineBooking(String hostEmail, Long bookingId, String reason) {
        User host = findUser(hostEmail);
        CarBooking booking = carBookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Booking not found"));

        if (!booking.getCar().getHost().getId().equals(host.getId())) {
            throw new RuntimeException("You can only manage bookings on your own listings");
        }
        if (booking.getStatus() == BookingStatus.CANCELLED) {
            return toResponse(booking);
        }
        if (booking.getStatus() == BookingStatus.COMPLETED) {
            throw new RuntimeException("This booking is already completed");
        }

        boolean wasPaid = Boolean.TRUE.equals(booking.getPaid());
        booking.setStatus(BookingStatus.CANCELLED);
        CarBooking saved = carBookingRepository.save(booking);

        try {
            emailService.sendBookingDeclinedEmail(
                    booking.getGuest().getEmail(),
                    booking.getGuest().getFirstName(),
                    carLabel(booking.getCar()),
                    booking.getStartDate(),
                    booking.getEndDate(),
                    booking.getTotalPrice(),
                    wasPaid,
                    reason
            );
        } catch (Exception e) {
            System.err.println("[CarBooking] Failed to send declined email to "
                    + booking.getGuest().getEmail() + ": " + e.getMessage());
        }

        return toResponse(saved);
    }

    // ------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------

    private String carLabel(Car car) {
        StringBuilder sb = new StringBuilder();
        if (car.getYear() != null) sb.append(car.getYear()).append(' ');
        if (car.getMake() != null) sb.append(car.getMake());
        if (car.getModel() != null) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(car.getModel());
        }
        return sb.length() > 0 ? sb.toString() : "your car";
    }

    private String validateStay(Car car, LocalDate startDate, LocalDate endDate) {
        if (car.getStatus() != CarStatus.ACTIVE) {
            return "This car is not available for rent";
        }
        if (startDate == null || endDate == null) {
            return "Choose pickup and return dates";
        }
        if (startDate.isBefore(LocalDate.now())) {
            return "Pickup date cannot be in the past";
        }
        if (!endDate.isAfter(startDate)) {
            return "Return date must be after pickup";
        }
        if (ChronoUnit.DAYS.between(startDate, endDate) > MAX_DAYS) {
            return "Rentals are limited to " + MAX_DAYS + " days";
        }
        if (!carBookingRepository.findBlockingBookings(car.getId(), startDate, endDate).isEmpty()) {
            return "This car is already booked for those dates";
        }
        return null;
    }

    private Car findCar(Long id) {
        return carRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Car not found"));
    }

    private User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Account not found"));
    }

    private CarBookingResponse toResponse(CarBooking booking) {
        Car car = booking.getCar();
        User guest = booking.getGuest();

        CarBookingResponse response = new CarBookingResponse();
        response.setId(booking.getId());
        response.setCarId(car.getId());
        response.setHostId(car.getHost().getId());
        response.setMake(car.getMake());
        response.setModel(car.getModel());
        response.setImageUrl(car.getImageUrl());
        response.setGuestUserId(guest.getId());
        response.setGuestFirstName(guest.getFirstName());
        response.setGuestLastName(guest.getLastName());
        response.setStartDate(booking.getStartDate());
        response.setEndDate(booking.getEndDate());
        response.setDailyRate(booking.getDailyRateSnapshot());
        response.setTotalDays(booking.getTotalDays());
        response.setTotalPrice(booking.getTotalPrice());
        response.setStatus(booking.getStatus().name());
        response.setPaid(Boolean.TRUE.equals(booking.getPaid()));
        response.setCreatedAt(booking.getCreatedAt());
        return response;
    }
}