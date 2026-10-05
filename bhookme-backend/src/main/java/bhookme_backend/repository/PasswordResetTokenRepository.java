package bhookme_backend.repository;

import bhookme_backend.model.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByToken(String token);

    /**
     * Delete every existing token for this user - called right before
     * issuing a new one, so at any moment there's at most one live
     * reset link per account.
     *
     * clearAutomatically / flushAutomatically are important: without
     * them Spring may keep a stale PasswordResetToken in the JPA
     * persistence context after the delete, and the subsequent save
     * of a new token can misbehave.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM PasswordResetToken t WHERE t.userId = :userId")
    void deleteAllForUser(@Param("userId") Long userId);
}