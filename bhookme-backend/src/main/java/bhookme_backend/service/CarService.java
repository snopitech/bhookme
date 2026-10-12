package bhookme_backend.service;

import bhookme_backend.dto.CarResponse;
import bhookme_backend.model.Car;
import bhookme_backend.model.CarStatus;
import bhookme_backend.model.User;
import bhookme_backend.repository.CarRepository;
import bhookme_backend.repository.UserRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Year;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class CarService {

    private static final Logger log = LoggerFactory.getLogger(CarService.class);

    public static final int MAX_PHOTOS_PER_CAR = 30;

    private final CarRepository carRepository;
    private final UserRepository userRepository;
    private final R2StorageService r2StorageService;
    private final JdbcTemplate jdbc;

    public CarService(CarRepository carRepository, UserRepository userRepository,
                      R2StorageService r2StorageService, JdbcTemplate jdbc) {
        this.carRepository = carRepository;
        this.userRepository = userRepository;
        this.r2StorageService = r2StorageService;
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------
    // "deleted" column on car_rentals - added automatically here on
    // startup (no manual SQL needed). It is NOT mapped in Car.java,
    // so Hibernate's schema validation never complains about it.
    // ------------------------------------------------------------
    @PostConstruct
    void ensureDeletedColumn() {
        try {
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS " +
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'car_rentals' AND COLUMN_NAME = 'deleted'",
                    Integer.class);
            if (exists == null || exists == 0) {
                jdbc.execute("ALTER TABLE car_rentals ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0");
                log.info("Added column car_rentals.deleted");
            }
        } catch (Exception e) {
            log.warn("Could not add column car_rentals.deleted: {}", e.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public List<CarResponse> getActiveCars() {
        return carRepository.findByStatus(CarStatus.ACTIVE).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public CarResponse getCarById(Long id) {
        Car car = carRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Car not found"));
        return toResponse(car);
    }

    // The logged-in host's own cars, newest first - Host Dashboard Car Rental tab.
    @Transactional(readOnly = true)
    public List<CarResponse> getMyCars(String hostEmail) {
        User host = findUser(hostEmail);
        Set<Long> deletedIds = deletedCarIds(host.getId());
        return carRepository.findByHost_Id(host.getId()).stream()
                .filter(c -> !deletedIds.contains(c.getId()))
                .sorted(Comparator.comparing(Car::getId).reversed())
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    // Create a car listing with its photos (already uploaded via /api/upload/image).
    // The first photo is the cover and is also stored in car_rentals.image_url.
    // There is NO limit on how many cars one host can list.
    @Transactional
    public CarResponse createCar(String hostEmail, Map<String, Object> body) {
        User host = findUser(hostEmail);

        Car car = new Car();
        car.setHost(host);
        List<String> photos = applyFields(car, body);
        car.setStatus(CarStatus.ACTIVE);
        Car saved = carRepository.save(car);
        savePhotos(saved.getId(), photos);

        if (!Boolean.TRUE.equals(host.getIsHost())) {
            host.setIsHost(true);
            userRepository.save(host);
        }

        return toResponse(saved);
    }

    // Edit one of the host's own cars: same fields as create
    // (make, model, year, category, city, state, dailyRate, imageUrls).
    // The photo list sent replaces the old one (order kept, first = cover).
    // Status (Active/Paused) and existing bookings are not touched.
    @Transactional
    public CarResponse updateCar(String hostEmail, Long carId, Map<String, Object> body) {
        Car car = findOwnCar(hostEmail, carId);

        List<String> photos = applyFields(car, body);
        Car saved = carRepository.save(car);

        jdbc.update("DELETE FROM car_rental_images WHERE car_id = ?", saved.getId());
        savePhotos(saved.getId(), photos);

        return toResponse(saved);
    }

    // Validates the form fields and copies them onto the car.
    // Returns the cleaned photo list (at least one).
    private List<String> applyFields(Car car, Map<String, Object> body) {
        String make = text(body.get("make"));
        String model = text(body.get("model"));
        String category = text(body.get("category"));
        String city = text(body.get("city"));
        String state = text(body.get("state"));
        Integer year = intOrNull(body.get("year"));
        BigDecimal dailyRate = decimalOrNull(body.get("dailyRate"));

        if (make == null) throw new RuntimeException("Enter the car's make (e.g. Toyota).");
        if (model == null) throw new RuntimeException("Enter the car's model (e.g. Camry).");
        int maxYear = Year.now().getValue() + 1;
        if (year == null || year < 1980 || year > maxYear) {
            throw new RuntimeException("Year must be between 1980 and " + maxYear + ".");
        }
        if (category == null) throw new RuntimeException("Pick a category.");
        if (city == null) throw new RuntimeException("Enter the city where the car is picked up.");
        if (state == null) throw new RuntimeException("Enter the state.");
        if (dailyRate == null || dailyRate.compareTo(BigDecimal.ONE) < 0) {
            throw new RuntimeException("Daily price must be at least $1.");
        }

        List<String> photos = photoList(body.get("imageUrls"));
        if (photos.isEmpty()) throw new RuntimeException("Add at least one photo of the car.");

        car.setMake(make);
        car.setModel(model);
        car.setYear(year);
        car.setCategory(category);
        car.setCity(city);
        car.setState(state.toUpperCase()); // "Tx" -> "TX"
        car.setDailyRate(dailyRate);
        car.setImageUrl(photos.get(0));
        return photos;
    }

    private void savePhotos(Long carId, List<String> photos) {
        for (int i = 0; i < photos.size(); i++) {
            jdbc.update("INSERT INTO car_rental_images (car_id, image_url, display_order) VALUES (?, ?, ?)",
                    carId, photos.get(i), i);
        }
    }

    // Pause (INACTIVE) or reactivate (ACTIVE) one of the host's own cars.
    @Transactional
    public CarResponse setStatus(String hostEmail, Long carId, String status) {
        Car car = findOwnCar(hostEmail, carId);
        CarStatus newStatus;
        try {
            newStatus = CarStatus.valueOf(String.valueOf(status).trim().toUpperCase());
        } catch (Exception e) {
            throw new RuntimeException("Status must be ACTIVE or INACTIVE.");
        }
        car.setStatus(newStatus);
        return toResponse(carRepository.save(car));
    }

    // Delete one of the host's own cars.
    //  - Upcoming/ongoing PENDING or CONFIRMED bookings -> refused
    //    (the host must cancel or finish them first, or Pause the car).
    //  - Never booked -> removed completely (photos + wishlist entries too).
    //  - Has booking history -> hidden for good (deleted=true, INACTIVE),
    //    so guests' and the host's past bookings still show the car.
    @Transactional
    public Map<String, Object> deleteCar(String hostEmail, Long carId) {
        Car car = findOwnCar(hostEmail, carId);

        Integer upcoming = jdbc.queryForObject(
                "SELECT COUNT(*) FROM car_bookings WHERE car_id = ? AND status IN ('PENDING','CONFIRMED') AND end_date >= CURDATE()",
                Integer.class, carId);
        if (upcoming != null && upcoming > 0) {
            throw new RuntimeException("This car has " + upcoming + " upcoming booking"
                    + (upcoming == 1 ? "" : "s") + ". Cancel or finish "
                    + (upcoming == 1 ? "it" : "them") + " first, or Pause the car instead.");
        }

        Integer anyBookings = jdbc.queryForObject(
                "SELECT COUNT(*) FROM car_bookings WHERE car_id = ?", Integer.class, carId);

        if (anyBookings == null || anyBookings == 0) {
            try {
                jdbc.update("DELETE FROM car_wishlist WHERE car_id = ?", carId);
                jdbc.update("DELETE FROM car_rental_images WHERE car_id = ?", carId);
                jdbc.update("DELETE FROM car_rentals WHERE id = ?", carId);
                return Map.of("id", carId, "deleted", true, "message", "Car deleted.");
            } catch (DataAccessException e) {
                // Something else still points at this car (e.g. a review):
                // fall through and hide it instead.
            }
        }

        jdbc.update("UPDATE car_rentals SET deleted = 1, status = 'INACTIVE' WHERE id = ?", carId);
        jdbc.update("DELETE FROM car_wishlist WHERE car_id = ?", carId);
        return Map.of("id", carId, "deleted", true, "message", "Car deleted.");
    }

    // ---------- helpers ----------

    private boolean isDeleted(Long carId) {
        try {
            Integer d = jdbc.queryForObject("SELECT deleted FROM car_rentals WHERE id = ?", Integer.class, carId);
            return d != null && d == 1;
        } catch (Exception e) {
            return false; // column missing -> nothing has been deleted yet
        }
    }

    private Set<Long> deletedCarIds(Long hostId) {
        try {
            return new HashSet<>(jdbc.queryForList(
                    "SELECT id FROM car_rentals WHERE host_user_id = ? AND deleted = 1", Long.class, hostId));
        } catch (Exception e) {
            return new HashSet<>();
        }
    }

    // Loads a car and makes sure it belongs to this host (and isn't deleted).
    private Car findOwnCar(String hostEmail, Long carId) {
        User host = findUser(hostEmail);
        Car car = carRepository.findById(carId)
                .orElseThrow(() -> new RuntimeException("Car not found"));
        if (!car.getHost().getId().equals(host.getId())) {
            throw new RuntimeException("You can only change your own cars.");
        }
        if (isDeleted(carId)) throw new RuntimeException("This car was deleted.");
        return car;
    }

    private List<String> photoList(Object raw) {
        List<String> urls = new ArrayList<>();
        if (!(raw instanceof List)) return urls;
        for (Object o : (List<?>) raw) {
            String u = text(o);
            if (u == null) continue;
            if (!r2StorageService.isOwnUrl(u)) {
                throw new RuntimeException("Photos must be uploaded through bhookme.");
            }
            if (!urls.contains(u)) urls.add(u);
        }
        if (urls.size() > MAX_PHOTOS_PER_CAR) {
            throw new RuntimeException("A car can have up to " + MAX_PHOTOS_PER_CAR + " photos.");
        }
        return urls;
    }

    private List<String> photosOf(Car car) {
        List<String> urls = jdbc.queryForList(
                "SELECT image_url FROM car_rental_images WHERE car_id = ? ORDER BY display_order, id",
                String.class, car.getId());
        if (urls.isEmpty() && car.getImageUrl() != null) {
            urls = new ArrayList<>(List.of(car.getImageUrl())); // older cars: single photo only
        }
        return urls;
    }

    private User findUser(String email) {
        if (email == null) throw new RuntimeException("Please log in.");
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Account not found"));
    }

    private String text(Object value) {
        if (value == null) return null;
        String s = value.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private Integer intOrNull(Object value) {
        String s = text(value);
        if (s == null) return null;
        try { return new BigDecimal(s).intValueExact(); } catch (Exception e) { return null; }
    }

    private BigDecimal decimalOrNull(Object value) {
        String s = text(value);
        if (s == null) return null;
        try { return new BigDecimal(s); } catch (Exception e) { return null; }
    }

    private CarResponse toResponse(Car car) {
        CarResponse response = new CarResponse();
        response.setId(car.getId());
        response.setHostId(car.getHost().getId());
        response.setHostFirstName(car.getHost().getFirstName());
        response.setHostLastName(car.getHost().getLastName());
        response.setMake(car.getMake());
        response.setModel(car.getModel());
        response.setYear(car.getYear());
        response.setCategory(car.getCategory());
        response.setCity(car.getCity());
        response.setState(car.getState());
        response.setDailyRate(car.getDailyRate());
        response.setImageUrl(car.getImageUrl());
        response.setImageUrls(photosOf(car));
        response.setStatus(car.getStatus().name());
        return response;
    }
}