package com.photonicomega.facilities.module.security;

import com.photonicomega.facilities.module.auth.domain.Role;
import com.photonicomega.facilities.module.auth.domain.User;
import com.photonicomega.facilities.module.auth.domain.UserStatus;
import com.photonicomega.facilities.module.auth.repository.RoleRepository;
import com.photonicomega.facilities.module.auth.repository.UserRepository;
import com.photonicomega.facilities.module.security.domain.RiskLevel;
import com.photonicomega.facilities.module.security.domain.SecurityLog;
import com.photonicomega.facilities.module.security.domain.SecurityModule;
import com.photonicomega.facilities.module.security.repository.SecurityLogRepository;
import com.photonicomega.facilities.module.security.service.geo.IpGeo;
import com.photonicomega.facilities.module.security.service.geo.IpGeolocationService;
import com.photonicomega.facilities.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Guards the geolocation contract that the Security Admin threat map depends on.
 *
 * {@code IpGeolocationService.peek} is declared to return {@code Optional<IpGeo>}
 * and documented to return {@code Optional.empty()} when an IP is not cached.
 * Every caller trusts that signature and chains {@code .map(...)} straight off
 * the result without a null check - there are eight such chains in
 * {@code SecurityThreatMapService.toGatewayLogEntry} alone. So a single
 * implementation that hands back a bare {@code null} on a cache miss does not
 * degrade the feature, it throws {@link NullPointerException} inside a REST
 * handler, and the Security Admin dashboard gets a 500 instead of a map.
 *
 * A cache miss is the ordinary case, not the exotic one: the cache is in-memory
 * with a TTL, only {@code geolocate} ever populates it, and it is empty after
 * every restart. So the failure is not an edge case that needs an unlucky
 * sequence to reproduce - it is what happens on the first request.
 *
 * Both tests below are deliberately written against the interface and the route
 * rather than against the implementation, because the defect is a broken promise
 * between the two: fixing it inside one call site would leave the other seven,
 * and fixing it by null-checking at the call sites would concede that a method
 * returning {@code Optional} may return null.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ThreatMapGeoContractTest {

    /** An address no test will have geolocated, so it is guaranteed uncached. */
    private static final String UNCACHED_IP = "203.0.113.77";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private IpGeolocationService ipGeolocationService;

    @Autowired
    private SecurityLogRepository securityLogRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    private String superAdminToken;

    @BeforeEach
    void seedSuperAdmin() {
        String email = "geo.superadmin@test.local";
        if (userRepository.findByEmailAndDeletedFalse(email).isEmpty()) {
            Role superRole = roleRepository.findByName("SUPER_ADMIN")
                    .orElseGet(() -> roleRepository.save(Role.builder()
                            .name("SUPER_ADMIN")
                            .displayName("super admin")
                            .description("geo contract test role")
                            .build()));
            userRepository.save(User.builder()
                    .firstName("Geo")
                    .lastName("Tester")
                    .email(email)
                    .department("IT")
                    .passwordHash("$2a$10$invalid-hash")
                    .status(UserStatus.ACTIVE)
                    .roles(Set.of(superRole))
                    .build());
        }
        UserDetails principal = new org.springframework.security.core.userdetails.User(
                email, "unused", true, true, true, true,
                List.of(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN")));
        superAdminToken = jwtTokenProvider.generateAccessToken(principal);
    }

    @Test
    @DisplayName("peek() on an uncached IP returns an empty Optional, never null")
    void peekNeverReturnsNull() {
        Optional<IpGeo> result = ipGeolocationService.peek(UNCACHED_IP);

        assertThat(result)
                .as("peek is declared Optional<IpGeo> and documented to return "
                        + "Optional.empty() for an uncached IP; returning null breaks "
                        + "every caller that chains .map() off it")
                .isNotNull()
                .isEmpty();

        // The same promise has to hold for the inputs callers actually pass, which
        // include blanks and untrimmed values from proxy headers.
        assertThat(ipGeolocationService.peek("")).isNotNull().isEmpty();
        assertThat(ipGeolocationService.peek("  " + UNCACHED_IP + "  ")).isNotNull().isEmpty();
        assertThat(ipGeolocationService.peek(null)).isNotNull().isEmpty();
    }

    @Test
    @DisplayName("GET /v1/security/ip-threats/vector-map serves a log with an uncached IP without a 500")
    void vectorMapRendersUncachedIpWithoutServerError() throws Exception {
        securityLogRepository.save(SecurityLog.builder()
                .timestamp(Instant.now())
                .username("geo.superadmin@test.local")
                .ipAddress(UNCACHED_IP)
                .action("LOGIN_SUCCESS")
                .module(SecurityModule.AUTHENTICATION)
                .status("SUCCESS")
                .reason("threat map geo contract fixture")
                .riskLevel(RiskLevel.LOW)
                .build());

        // /stats already passes today because it never maps a log to a feed entry.
        // /vector-map does, on every one of the most recent logs, so it is the route
        // that actually exercises peek().
        mockMvc.perform(get("/v1/security/ip-threats/stats")
                        .header("Authorization", "Bearer " + superAdminToken))
                .andExpect(status().isOk());

        mockMvc.perform(get("/v1/security/ip-threats/vector-map")
                        .header("Authorization", "Bearer " + superAdminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.recentLogs").isArray());
    }
}
