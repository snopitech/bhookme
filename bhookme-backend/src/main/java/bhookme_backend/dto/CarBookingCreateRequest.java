package bhookme_backend.dto;

import java.time.LocalDate;

public class CarBookingCreateRequest {
    private Long carId;
    private LocalDate startDate;
    private LocalDate endDate;

    public Long getCarId() { return carId; }
    public void setCarId(Long carId) { this.carId = carId; }

    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }

    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }
}