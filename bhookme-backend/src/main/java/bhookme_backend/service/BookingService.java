package bhookme_backend.service;

import bhookme_backend.dto.BookingCreateRequest;
import bhookme_backend.dto.BookingResponse;
import bhookme_backend.dto.QuoteResponse;
import bhookme_backend.model.Booking;
import bhookme_backend.model.BookingStatus;
import bhookme_backend.model.Property;
import bhookme_backend.model.PropertyImage;
import bhookme_backend.model.PropertyStatus;
import bhookme_backend.model.User;
import bhookme_backend.repository.BookingRepository;
import bhookme_backend.repository.PropertyRepository;
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
public class BookingService {

    private static final int MAX_NIGHTS = 90;

    private final BookingRepository bookingRepository;
    private final PropertyRepository propertyRepository;
    private final UserRepository userRepository;
    private final EmailService emailService;

    public BookingService(BookingRepository bookingRepository,
                           PropertyRepository propertyRepository,
                           UserRepository userRepository,
                           EmailService emailService) {
        this.bookingRepository = bookingRepository;
        this.propertyRepository = propertyRepository;
        this.userRepository = userRepository;
        this.emailService = emailService;
    }

    @Transactional(readOnly = true)
    public QuoteResponse getQuote(Long propertyId, LocalDate checkIn, LocalDate checkOut, int guests) {
        Property property = findProperty(propertyId);
        QuoteResponse quote = new QuoteResponse();

        String problem = validateStay(property, checkIn, checkOut, guests);
        if (problem != null) {
            quote.setAvailable(false);
            quote.setMessage(problem);
            return quote;
        }

        Price price = new Price(property, checkIn, checkOut);
        quote.setAvailable(true);
        quote.setTotalNights(price.nights);
        quote.setNightlyRate(price.nightly);
        quote.setSubtotal(price.subtotal);
        quote.setCleaningFee(price.cleaning);
        quote.setTotalPrice(price.total);
        return quote;
    }

    @Transactional
    public BookingResponse createBooking(String email, BookingCreateRequest request) {
        User guest = findUser(email);

        if (request.getPropertyId() == null) {
            throw new RuntimeException("Property is required");
        }
        Property property = findProperty(request.getPropertyId());

        if (guest.getDateOfBirth() == null) {
            throw new RuntimeException("Please complete your profile (date of birth) before booking");
        }
        if (property.getHost().getId().equals(guest.getId())) {
            throw new RuntimeException("You cannot book your own listing");
        }

        int guests = request.getNumGuests() != null ? request.getNumGuests() : 1;
        String problem = validateStay(property, request.getCheckInDate(), request.getCheckOutDate(), guests);
        if (problem != null) {
            throw new RuntimeException(problem);
        }

        Price price = new Price(property, request.getCheckInDate(), request.getCheckOutDate());

        Booking booking = new Booking();
        booking.setProperty(property);
        booking.setGuest(guest);
        booking.setCheckInDate(request.getCheckInDate());
        booking.setCheckOutDate(request.getCheckOutDate());
        booking.setNumGuests(guests);
        booking.setNightlyRateSnapshot(price.nightly);
        booking.setTotalNights(price.nights);
        booking.setSubtotal(price.subtotal);
        booking.setCleaningFee(price.cleaning);
        booking.setTotalPrice(price.total);
        booking.setStatus(BookingStatus.PENDING);
        booking.setPaid(false);

        return toResponse(bookingRepository.save(booking));
    }

    @Transactional(readOnly = true)
    public List<BookingResponse> getMyBookings(String email) {
        User guest = findUser(email);
        return bookingRepository.findByGuestId(guest.getId()).stream()
                .sorted(Comparator.comparing(Booking::getCheckInDate).reversed())
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<BookingResponse> getHostBookings(String hostEmail) {
        User host = findUser(hostEmail);
        return bookingRepository.findByProperty_Host_Id(host.getId()).stream()
                .sorted(Comparator.comparing(Booking::getCreatedAt).reversed())
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<Map<String, String>> getBlockedDates(Long propertyId) {
        findProperty(propertyId);
        return bookingRepository.findBlockingBookingsForProperty(propertyId).stream()
                .map(b -> {
                    Map<String, String> m = new HashMap<>();
                    m.put("checkIn", b.getCheckInDate().toString());
                    m.put("checkOut", b.getCheckOutDate().toString());
                    return m;
                })
                .collect(Collectors.toList());
    }

    @Transactional
    public BookingResponse cancelBooking(String email, Long bookingId) {
        User guest = findUser(email);
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Booking not found"));

        if (!booking.getGuest().getId().equals(guest.getId())) {
            throw new RuntimeException("You can only cancel your own bookings");
        }
        if (booking.getStatus() == BookingStatus.CANCELLED) {
            return toResponse(booking);
        }
        if (booking.getStatus() == BookingStatus.COMPLETED
                || booking.getCheckInDate().isBefore(LocalDate.now())) {
            throw new RuntimeException("This booking can no longer be cancelled");
        }

        booking.setStatus(BookingStatus.CANCELLED);
        return toResponse(bookingRepository.save(booking));
    }

    // ------------------------------------------------------------
    // Host actions: mark paid, confirm, decline
    // ------------------------------------------------------------

    @Transactional
    public BookingResponse setBookingPaid(String hostEmail, Long bookingId, boolean paid) {
        User host = findUser(hostEmail);
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Booking not found"));

        if (!booking.getProperty().getHost().getId().equals(host.getId())) {
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
        Booking saved = bookingRepository.save(booking);

        if (!wasPaid && paid) {
            try {
                emailService.sendBookingPaidEmail(
                        booking.getGuest().getEmail(),
                        booking.getGuest().getFirstName(),
                        booking.getProperty().getTitle(),
                        booking.getCheckInDate(),
                        booking.getCheckOutDate(),
                        booking.getTotalPrice()
                );
            } catch (Exception e) {
                System.err.println("[Booking] Failed to send paid email to "
                        + booking.getGuest().getEmail() + ": " + e.getMessage());
            }
        }

        return toResponse(saved);
    }

    @Transactional
    public BookingResponse setBookingConfirmed(String hostEmail, Long bookingId, String targetStatus) {
        User host = findUser(hostEmail);
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Booking not found"));

        if (!booking.getProperty().getHost().getId().equals(host.getId())) {
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

        Booking saved = bookingRepository.save(booking);

        if (previous != BookingStatus.CONFIRMED && booking.getStatus() == BookingStatus.CONFIRMED) {
            try {
                emailService.sendBookingConfirmedEmail(
                        booking.getGuest().getEmail(),
                        booking.getGuest().getFirstName(),
                        booking.getProperty().getTitle(),
                        booking.getCheckInDate(),
                        booking.getCheckOutDate(),
                        booking.getTotalPrice()
                );
            } catch (Exception e) {
                System.err.println("[Booking] Failed to send confirmed email to "
                        + booking.getGuest().getEmail() + ": " + e.getMessage());
            }
        }

        return toResponse(saved);
    }

    @Transactional
    public BookingResponse declineBooking(String hostEmail, Long bookingId, String reason) {
        User host = findUser(hostEmail);
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Booking not found"));

        if (!booking.getProperty().getHost().getId().equals(host.getId())) {
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
        Booking saved = bookingRepository.save(booking);

        try {
            emailService.sendBookingDeclinedEmail(
                    booking.getGuest().getEmail(),
                    booking.getGuest().getFirstName(),
                    booking.getProperty().getTitle(),
                    booking.getCheckInDate(),
                    booking.getCheckOutDate(),
                    booking.getTotalPrice(),
                    wasPaid,
                    reason
            );
        } catch (Exception e) {
            System.err.println("[Booking] Failed to send declined email to "
                    + booking.getGuest().getEmail() + ": " + e.getMessage());
        }

        return toResponse(saved);
    }

    // ------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------

    private String validateStay(Property property, LocalDate checkIn, LocalDate checkOut, int guests) {
        if (property.getStatus() != PropertyStatus.ACTIVE) {
            return "This listing is not available for booking";
        }
        if (checkIn == null || checkOut == null) {
            return "Choose check-in and check-out dates";
        }
        if (checkIn.isBefore(LocalDate.now())) {
            return "Check-in date cannot be in the past";
        }
        if (!checkOut.isAfter(checkIn)) {
            return "Check-out must be after check-in";
        }
        if (ChronoUnit.DAYS.between(checkIn, checkOut) > MAX_NIGHTS) {
            return "Stays are limited to " + MAX_NIGHTS + " nights";
        }
        if (guests < 1) {
            return "At least one guest is required";
        }
        if (guests > property.getMaxGuests()) {
            return "This place sleeps up to " + property.getMaxGuests() + " guests";
        }
        if (isBooked(property.getId(), checkIn, checkOut)) {
            return "Those dates are not available";
        }
        return null;
    }

    private boolean isBooked(Long propertyId, LocalDate checkIn, LocalDate checkOut) {
        return !bookingRepository.findBlockingBookings(propertyId, checkIn, checkOut).isEmpty();
    }

    private Property findProperty(Long id) {
        return propertyRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Property not found"));
    }

    private User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Account not found"));
    }

    private BookingResponse toResponse(Booking booking) {
        Property property = booking.getProperty();
        User guest = booking.getGuest();

        String imageUrl = property.getImages().stream()
                .min(Comparator.comparingInt((PropertyImage img) ->
                        img.getDisplayOrder() == null ? 0 : img.getDisplayOrder()))
                .map(PropertyImage::getImageUrl)
                .orElse(null);

        BookingResponse response = new BookingResponse();
        response.setId(booking.getId());
        response.setPropertyId(property.getId());
        response.setHostId(property.getHost().getId());
        response.setPropertyTitle(property.getTitle());
        response.setPropertyCity(property.getCity());
        response.setPropertyState(property.getState());
        response.setPropertyImageUrl(imageUrl);
        response.setGuestUserId(guest.getId());
        response.setGuestFirstName(guest.getFirstName());
        response.setGuestLastName(guest.getLastName());
        response.setCheckInDate(booking.getCheckInDate());
        response.setCheckOutDate(booking.getCheckOutDate());
        response.setNumGuests(booking.getNumGuests());
        response.setNightlyRate(booking.getNightlyRateSnapshot());
        response.setTotalNights(booking.getTotalNights());
        response.setSubtotal(booking.getSubtotal());
        response.setCleaningFee(booking.getCleaningFee());
        response.setTotalPrice(booking.getTotalPrice());
        response.setStatus(booking.getStatus().name());
        response.setPaid(Boolean.TRUE.equals(booking.getPaid()));
        response.setCreatedAt(booking.getCreatedAt());
        return response;
    }

    private static class Price {
        final int nights;
        final BigDecimal nightly;
        final BigDecimal subtotal;
        final BigDecimal cleaning;
        final BigDecimal total;

        Price(Property property, LocalDate checkIn, LocalDate checkOut) {
            this.nights = (int) ChronoUnit.DAYS.between(checkIn, checkOut);
            this.nightly = property.getBasePricePerNight();
            this.subtotal = nightly.multiply(BigDecimal.valueOf(nights)).setScale(2, RoundingMode.HALF_UP);
            this.cleaning = property.getCleaningFee() != null ? property.getCleaningFee() : BigDecimal.ZERO;
            this.total = subtotal.add(cleaning).setScale(2, RoundingMode.HALF_UP);
        }
    }
}