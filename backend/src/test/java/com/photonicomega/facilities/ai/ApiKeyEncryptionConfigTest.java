package com.photonicomega.facilities.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Holds the line between "a fresh clone boots with one command" and "a deployment
 * can start with a key everybody can read".
 *
 * <h3>The fault this was written to name</h3>
 * {@code application.yml} says of the {@code dev} profile: "the zero-configuration
 * profile: it needs no external database and no environment variables, so a fresh
 * clone boots green with one command." That was not true. The {@code dev} document
 * set a datasource and a bcrypt strength but no {@code app.ai.encryption-key}, so
 * the root default {@code ${AI_API_KEY_ENCRYPTION_KEY:}} resolved to blank,
 * {@link ApiKeyEncryptionService} failed fast exactly as designed, and
 * {@code mvnw spring-boot:run} died during context refresh with
 * "Error creating bean with name 'apiKeyEncryptionService'". The whole backend -
 * every route, not just the AI ones - was unreachable locally.
 *
 * <p>The full test suite stayed green throughout, which is the interesting part:
 * the {@code test} profile carries its own key at
 * {@code application.yml} and every {@code @SpringBootTest} activates it. So 146
 * passing tests said nothing about whether the application a developer actually
 * starts can start. This class is the missing check, and it deliberately exercises
 * the profile a developer runs rather than the profile the tests run.
 *
 * <h3>Why a context runner and not @SpringBootTest</h3>
 * The point is to load the real {@code application.yml} under the real {@code dev}
 * profile and construct the real bean the way Spring does - via {@code @Value} on
 * the property, not by handing a literal to a constructor, which is what
 * {@link ApiKeyEncryptionServiceTest} already covers. A {@code @SpringBootTest} on
 * the {@code dev} profile would also stand up a file-backed H2 database under
 * {@code ./data} and leave it behind. {@link ConfigDataApplicationContextInitializer}
 * gives the property resolution without the datasource.
 */
class ApiKeyEncryptionConfigTest {

    /**
     * The key committed for the {@code dev} profile. Published on purpose: it is in
     * the repository, so it protects nothing, and the guard below is what stops that
     * from mattering.
     */
    private static final String PUBLISHED_DEV_KEY = "0tJRq8HSlEH5Ddjv5Y+bjObw/AWl9DTY0yjyoFiNrYw=";

    /** The key the {@code test} profile has carried all along - equally public. */
    private static final String PUBLISHED_TEST_KEY = "u7C3tz495/FDo8wghmVAvVZKBPzWFIlejhyXfGa06qg=";

    private ApplicationContextRunner underProfile(String profile) {
        return new ApplicationContextRunner()
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=" + profile)
                .withUserConfiguration(EncryptionOnly.class);
    }

    @Test
    @DisplayName("The dev profile starts with no environment variables set at all")
    void theDevProfileNeedsNoEnvironmentVariables() {
        underProfile("dev").run(context -> {
            assertThat(context)
                    .as("`mvnw spring-boot:run` uses the dev profile and sets nothing else, so if "
                        + "this context cannot refresh then the local backend cannot start - not the "
                        + "AI console, the whole application")
                    .hasNotFailed();
            ApiKeyEncryptionService service = context.getBean(ApiKeyEncryptionService.class);
            // A key that decodes to 32 bytes is not enough; it has to be the key the
            // service will actually seal and unseal provider keys with, or a developer
            // discovers the misconfiguration later, on a value they can no longer read.
            String sealed = service.encrypt("sk-dev-round-trip");
            assertThat(service.decrypt(sealed)).isEqualTo("sk-dev-round-trip");
        });
    }

    @Test
    @DisplayName("A deployed profile with no key still refuses to start")
    void aDeployedProfileWithoutAKeyStillFailsFast() {
        underProfile("supabase").run(context -> assertThat(context)
                .as("the fail-fast is the control, not the bug - giving dev a key must not give "
                    + "production a default one")
                .getFailure()
                .rootCause()
                .hasMessageContaining("AI_API_KEY_ENCRYPTION_KEY"));
    }

    @Test
    @DisplayName("The published dev key is refused when it turns up in a deployed profile")
    void thePublishedDevKeyIsRefusedOutsideDevelopment() {
        underProfile("supabase")
                .withPropertyValues("app.ai.encryption-key=" + PUBLISHED_DEV_KEY)
                .run(context -> assertThat(context)
                        .as("the realistic way a committed dev key reaches production is a person "
                            + "copying the value they found in the repo into AI_API_KEY_ENCRYPTION_KEY; "
                            + "nothing about that is caught by a length check, because the key is a "
                            + "perfectly valid 256-bit key")
                        .getFailure()
                        .rootCause()
                        .hasMessageContaining("published"));
    }

    @Test
    @DisplayName("The published test key is refused in a deployed profile too")
    void thePublishedTestKeyIsRefusedOutsideDevelopment() {
        underProfile("local")
                .withPropertyValues("app.ai.encryption-key=" + PUBLISHED_TEST_KEY)
                .run(context -> assertThat(context)
                        .as("this key has been committed for longer than the dev one and is the more "
                            + "likely of the two to be copied")
                        .getFailure()
                        .rootCause()
                        .hasMessageContaining("published"));
    }

    @Test
    @DisplayName("A real key is accepted in a deployed profile")
    void aKeyOfItsOwnIsAcceptedInADeployedProfile() {
        underProfile("supabase")
                .withPropertyValues("app.ai.encryption-key=Zt1kQIeGV5nDdmUwYlk6ODhLLzRtSGZQOGhLTG8xUT0=")
                .run(context -> assertThat(context)
                        .as("the guard must reject the two published keys and nothing else - a rule "
                            + "that also blocked legitimate keys would be worked around by whoever "
                            + "is trying to deploy")
                        .hasNotFailed());
    }

    @Test
    @DisplayName("The published keys are still usable under the profiles they belong to")
    void thePublishedKeysWorkWhereTheyAreMeantTo() {
        underProfile("test").run(context -> assertThat(context)
                .as("every @SpringBootTest in this repository runs on the test profile and its key "
                    + "is one of the two the guard knows about, so a guard that ignored the active "
                    + "profile would take the entire suite down with it")
                .hasNotFailed());
    }

    /**
     * Declares the bean the same way the component scan does, so the {@code @Value}
     * default and the property precedence under test are the production ones.
     */
    @Configuration
    static class EncryptionOnly {
        @Bean
        ApiKeyEncryptionService apiKeyEncryptionService(
                @Value("${app.ai.encryption-key:}") String base64Key, Environment environment) {
            return new ApiKeyEncryptionService(base64Key, environment);
        }
    }
}
