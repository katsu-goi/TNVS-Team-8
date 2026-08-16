package com.photonicomega.facilities.common.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Rejects malformed emails and personal / free-mail providers (Gmail, Yahoo,
 * Hotmail, Outlook, ...) so that only well-formed corporate email addresses are
 * accepted. The validator performs the full format check itself, so combine it
 * only with {@code @NotBlank} and {@code @Size}.
 */
@Documented
@Constraint(validatedBy = CorporateEmailValidator.class)
@Target({ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface CorporateEmail {

    String message() default "Please enter a valid corporate email address.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
