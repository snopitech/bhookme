package bhookme_backend.dto;

import java.math.BigDecimal;
import java.util.List;

public class CarResponse {
    private Long id;
    private Long hostId;
    private String hostFirstName;
    private String hostLastName;
    private String make;
    private String model;
    private Integer year;
    private String category;
    private String city;
    private String state;
    private BigDecimal dailyRate;
    private String imageUrl;
    private List<String> imageUrls;
    private String status;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getHostId() { return hostId; }
    public void setHostId(Long hostId) { this.hostId = hostId; }

    public String getHostFirstName() { return hostFirstName; }
    public void setHostFirstName(String hostFirstName) { this.hostFirstName = hostFirstName; }

    public String getHostLastName() { return hostLastName; }
    public void setHostLastName(String hostLastName) { this.hostLastName = hostLastName; }

    public String getMake() { return make; }
    public void setMake(String make) { this.make = make; }

    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }

    public Integer getYear() { return year; }
    public void setYear(Integer year) { this.year = year; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public BigDecimal getDailyRate() { return dailyRate; }
    public void setDailyRate(BigDecimal dailyRate) { this.dailyRate = dailyRate; }

    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }

    public List<String> getImageUrls() { return imageUrls; }
    public void setImageUrls(List<String> imageUrls) { this.imageUrls = imageUrls; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}