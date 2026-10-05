package bhookme_backend.service;

import bhookme_backend.dto.PropertyCreateRequest;
import bhookme_backend.dto.PropertyResponse;
import bhookme_backend.model.*;
import bhookme_backend.repository.PropertyImageRepository;
import bhookme_backend.repository.PropertyRepository;
import bhookme_backend.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class PropertyService {

    // Same cap the photo uploader shows hosts.
    public static final int MAX_PHOTOS_PER_LISTING = 30;

    private final PropertyRepository propertyRepository;
    private final UserRepository userRepository;
    private final PropertyImageRepository propertyImageRepository;
    private final FileUploadService fileUploadService;
    private final R2StorageService r2StorageService;
    private final JdbcTemplate jdbc;

    public PropertyService(PropertyRepository propertyRepository,
                            UserRepository userRepository,
                            PropertyImageRepository propertyImageRepository,
                            FileUploadService fileUploadService,
                            R2StorageService r2StorageService,
                            JdbcTemplate jdbc) {
        this.propertyRepository = propertyRepository;
        this.userRepository = userRepository;
        this.propertyImageRepository = propertyImageRepository;
        this.fileUploadService = fileUploadService;
        this.r2StorageService = r2StorageService;
        this.jdbc = jdbc;
    }

    public PropertyResponse createProperty(String hostEmail, PropertyCreateRequest request) {
        User host = userRepository.findByEmail(hostEmail)
                .orElseThrow(() -> new RuntimeException("Host account not found"));

        Property property = new Property();
        property.setHost(host);
        applyDetails(property, request);
        property.setStatus(PropertyStatus.ACTIVE);

        if (!Boolean.TRUE.equals(host.getIsHost())) {
            host.setIsHost(true);
            userRepository.save(host);
        }

        Property saved = propertyRepository.save(property);
        return toResponse(saved);
    }

    // Edit a listing's details (everything except photos and status).
    @Transactional
    public PropertyResponse updateProperty(String hostEmail, Long propertyId, PropertyCreateRequest request) {
        Property property = findOwnedProperty(hostEmail, propertyId);
        applyDetails(property, request);
        return toResponse(propertyRepository.save(property));
    }

    // Pause (INACTIVE) or reactivate (ACTIVE) a listing.
    @Transactional
    public PropertyResponse setStatus(String hostEmail, Long propertyId, String status) {
        Property property = findOwnedProperty(hostEmail, propertyId);
        PropertyStatus newStatus;
        try {
            newStatus = PropertyStatus.valueOf(String.valueOf(status).trim().toUpperCase());
        } catch (Exception e) {
            throw new RuntimeException("Status must be ACTIVE or INACTIVE.");
        }
        if (newStatus == PropertyStatus.DRAFT) {
            throw new RuntimeException("Status must be ACTIVE or INACTIVE.");
        }
        property.setStatus(newStatus);
        return toResponse(propertyRepository.save(property));
    }

    // Replace all photos with the given list, in order (first = cover).
    // New photos must be bhookme R2 uploads; photos already on the listing
    // may be kept even if they came from elsewhere.
    @Transactional
    public PropertyResponse replacePropertyImageUrls(String hostEmail, Long propertyId, List<String> urls) {
        Property property = findOwnedProperty(hostEmail, propertyId);

        List<String> cleaned = new ArrayList<>(new LinkedHashSet<>(
                urls.stream().filter(u -> u != null && !u.isBlank()).map(String::trim).collect(Collectors.toList())));
        if (cleaned.isEmpty()) {
            throw new RuntimeException("Keep at least one photo.");
        }
        if (cleaned.size() > MAX_PHOTOS_PER_LISTING) {
            throw new RuntimeException("A listing can have up to " + MAX_PHOTOS_PER_LISTING + " photos.");
        }

        Set<String> current = property.getImages().stream()
                .map(PropertyImage::getImageUrl)
                .collect(Collectors.toSet());
        for (String url : cleaned) {
            if (!current.contains(url) && !r2StorageService.isOwnUrl(url)) {
                throw new RuntimeException("Photos must be uploaded through bhookme.");
            }
        }

        property.getImages().clear();
        propertyRepository.saveAndFlush(property);

        for (int i = 0; i < cleaned.size(); i++) {
            PropertyImage image = new PropertyImage();
            image.setProperty(property);
            image.setImageUrl(cleaned.get(i));
            image.setDisplayOrder(i);
            image.setIsPrimary(i == 0);
            property.getImages().add(image);
        }
        return toResponse(propertyRepository.save(property));
    }

    // Delete a listing. Listings with any booking history can't be deleted
    // (guests' booking records must stay intact) - pause them instead.
    // For listings without bookings, every row that points at the listing
    // (photos, amenities, wishlist saves, messages, reviews ...) is removed first.
    @Transactional
    public void deleteProperty(String hostEmail, Long propertyId) {
        Property property = findOwnedProperty(hostEmail, propertyId);

        Integer bookings = 0;
        try {
            bookings = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM bookings WHERE property_id = ?", Integer.class, propertyId);
        } catch (RuntimeException ignored) {
            // no bookings table - nothing to protect
        }
        if (bookings != null && bookings > 0) {
            throw new RuntimeException("This listing has booking history, so it can't be deleted. "
                    + "Pause it instead to hide it from guests.");
        }

        // Every table with a foreign key to properties (except properties itself).
        List<Map<String, Object>> refs = jdbc.queryForList(
                "SELECT table_name AS t, column_name AS c FROM information_schema.key_column_usage " +
                "WHERE table_schema = DATABASE() AND referenced_table_name = 'properties' " +
                "AND table_name <> 'properties'");

        property.getImages().clear();
        property.getAmenities().clear();
        propertyRepository.saveAndFlush(property);

        for (Map<String, Object> ref : refs) {
            String table = String.valueOf(ref.get("t"));
            String column = String.valueOf(ref.get("c"));
            if (!table.matches("[A-Za-z0-9_]+") || !column.matches("[A-Za-z0-9_]+")) continue;
            jdbc.update("DELETE FROM `" + table + "` WHERE `" + column + "` = ?", propertyId);
        }

        propertyRepository.delete(property);
    }

    public List<String> uploadPropertyImages(String hostEmail, Long propertyId, List<MultipartFile> files) {
        Property property = findOwnedProperty(hostEmail, propertyId);

        boolean hasExistingImages = !property.getImages().isEmpty();
        List<String> uploadedUrls = new ArrayList<>();
        int order = property.getImages().size();

        for (MultipartFile file : files) {
            String url = fileUploadService.uploadPropertyImage(propertyId, file);

            PropertyImage image = new PropertyImage();
            image.setProperty(property);
            image.setImageUrl(url);
            image.setDisplayOrder(order++);
            image.setIsPrimary(!hasExistingImages && uploadedUrls.isEmpty());

            propertyImageRepository.save(image);
            uploadedUrls.add(url);
        }

        return uploadedUrls;
    }

    // Attaches photos already uploaded via /api/upload/image to a listing, in the
    // given order. The first photo becomes the cover if the listing had none.
    // Only links to bhookme's own R2 bucket are accepted.
    public PropertyResponse addPropertyImageUrls(String hostEmail, Long propertyId, List<String> urls) {
        Property property = findOwnedProperty(hostEmail, propertyId);

        // Drop blanks and duplicates, keep the host's order.
        List<String> cleaned = new ArrayList<>(new LinkedHashSet<>(
                urls.stream().filter(u -> u != null && !u.isBlank()).collect(Collectors.toList())));
        if (cleaned.isEmpty()) {
            throw new RuntimeException("Add at least one photo.");
        }
        for (String url : cleaned) {
            if (!r2StorageService.isOwnUrl(url)) {
                throw new RuntimeException("Photos must be uploaded through bhookme.");
            }
        }

        int existing = property.getImages().size();
        if (existing + cleaned.size() > MAX_PHOTOS_PER_LISTING) {
            throw new RuntimeException("A listing can have up to " + MAX_PHOTOS_PER_LISTING + " photos.");
        }

        boolean hasExistingImages = existing > 0;
        int order = existing;
        for (int i = 0; i < cleaned.size(); i++) {
            PropertyImage image = new PropertyImage();
            image.setProperty(property);
            image.setImageUrl(cleaned.get(i));
            image.setDisplayOrder(order++);
            image.setIsPrimary(!hasExistingImages && i == 0);
            propertyImageRepository.save(image);
            property.getImages().add(image);
        }

        return toResponse(property);
    }

    public PropertyResponse getPropertyById(Long id) {
        Property property = propertyRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Property not found"));
        return toResponse(property);
    }

    public List<PropertyResponse> getActiveProperties() {
        return propertyRepository.findByStatus(PropertyStatus.ACTIVE).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public List<PropertyResponse> getNearestProperties(double latitude, double longitude, int limit) {
        Pageable pageable = PageRequest.of(0, limit);
        return propertyRepository.findNearestActiveProperties(latitude, longitude, pageable).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public List<PropertyResponse> getMyProperties(String hostEmail) {
        User host = userRepository.findByEmail(hostEmail)
                .orElseThrow(() -> new RuntimeException("Host account not found"));

        return propertyRepository.findByHostId(host.getId()).stream()
                .sorted(Comparator.comparing(Property::getId).reversed())
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    // ---------- helpers ----------

    private Property findOwnedProperty(String hostEmail, Long propertyId) {
        User host = userRepository.findByEmail(hostEmail)
                .orElseThrow(() -> new RuntimeException("Host account not found"));
        Property property = propertyRepository.findById(propertyId)
                .orElseThrow(() -> new RuntimeException("Property not found"));
        if (!property.getHost().getId().equals(host.getId())) {
            throw new RuntimeException("You do not have permission to modify this listing");
        }
        return property;
    }

    // Shared by create and edit.
    private void applyDetails(Property property, PropertyCreateRequest request) {
        if (request.getTitle() == null || request.getTitle().isBlank()) {
            throw new RuntimeException("Title is required.");
        }
        if (request.getBasePricePerNight() == null) {
            throw new RuntimeException("Price per night is required.");
        }
        if (request.getLatitude() == null || request.getLongitude() == null) {
            throw new RuntimeException("Latitude and longitude are required.");
        }
        property.setTitle(request.getTitle().trim());
        property.setDescription(request.getDescription());
        property.setPropertyType(parsePropertyType(request.getPropertyType()));
        property.setCategory(parseCategory(request.getCategory()));
        property.setAddressLine1(request.getAddressLine1());
        property.setAddressLine2(request.getAddressLine2());
        property.setCity(request.getCity());
        property.setState(request.getState());
        property.setZipCode(request.getZipCode());
        if (request.getCountry() != null && !request.getCountry().isBlank()) {
            property.setCountry(request.getCountry());
        }
        property.setLatitude(request.getLatitude());
        property.setLongitude(request.getLongitude());
        if (request.getBedrooms() != null) property.setBedrooms(request.getBedrooms());
        if (request.getBathrooms() != null) property.setBathrooms(request.getBathrooms());
        if (request.getMaxGuests() != null) property.setMaxGuests(request.getMaxGuests());
        property.setBasePricePerNight(request.getBasePricePerNight());
        if (request.getCleaningFee() != null) property.setCleaningFee(request.getCleaningFee());
    }

    private PropertyType parsePropertyType(String value) {
        try {
            return PropertyType.valueOf(value);
        } catch (Exception e) {
            throw new RuntimeException("Invalid property type: " + value);
        }
    }

    private PropertyCategory parseCategory(String value) {
        if (value == null || value.isBlank()) return PropertyCategory.HOME;
        try {
            return PropertyCategory.valueOf(value);
        } catch (Exception e) {
            throw new RuntimeException("Invalid category: " + value);
        }
    }

    private PropertyResponse toResponse(Property property) {
        PropertyResponse response = new PropertyResponse();
        response.setId(property.getId());
        response.setHostId(property.getHost().getId());
        response.setHostFirstName(property.getHost().getFirstName());
        response.setHostLastName(property.getHost().getLastName());
        response.setTitle(property.getTitle());
        response.setDescription(property.getDescription());
        response.setPropertyType(property.getPropertyType().name());
        response.setCategory(property.getCategory().name());
        response.setAddressLine1(property.getAddressLine1());
        response.setAddressLine2(property.getAddressLine2());
        response.setCity(property.getCity());
        response.setState(property.getState());
        response.setZipCode(property.getZipCode());
        response.setCountry(property.getCountry());
        response.setLatitude(property.getLatitude());
        response.setLongitude(property.getLongitude());
        response.setBedrooms(property.getBedrooms());
        response.setBathrooms(property.getBathrooms());
        response.setMaxGuests(property.getMaxGuests());
        response.setBasePricePerNight(property.getBasePricePerNight());
        response.setCleaningFee(property.getCleaningFee());
        response.setStatus(property.getStatus().name());
        response.setCreatedAt(property.getCreatedAt());
        response.setAmenityNames(property.getAmenities().stream().map(Amenity::getName).collect(Collectors.toList()));
        // Photos in the host's chosen order (cover first).
        response.setImageUrls(property.getImages().stream()
                .sorted(Comparator.comparing(
                        (PropertyImage img) -> img.getDisplayOrder() == null ? 0 : img.getDisplayOrder()))
                .map(PropertyImage::getImageUrl)
                .collect(Collectors.toList()));
        return response;
    }
}