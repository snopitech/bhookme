package bhookme_backend.repository;

import bhookme_backend.model.Car;
import bhookme_backend.model.CarStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CarRepository extends JpaRepository<Car, Long> {
    List<Car> findByStatus(CarStatus status);
    List<Car> findByHost_Id(Long hostId);
}
