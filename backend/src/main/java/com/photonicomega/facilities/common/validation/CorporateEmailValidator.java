package com.photonicomega.facilities.common.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.List;

/**
 * Validates that an email address is well-formed and does not belong to a
 * common personal / free-mail provider. Corporate domains are anything not in
 * the blocklist, so the check does not need to know the specific company
 * domain(s) in use. Country-specific variants (e.g. {@code gmail.com.br}) are
 * also blocked.
 *
 * <p>The validator is responsible for the full format check (username, single
 * {@code @}, domain labels, and a {@code .com}-style top-level domain), so it
 * does not rely on {@code @jakarta.validation.constraints.Email}, whose lax
 * regex accepts values like {@code user@company}. Blank values are left to
 * {@code @NotBlank}.
 */
public class CorporateEmailValidator implements ConstraintValidator<CorporateEmail, String> {

    static final String INVALID_FORMAT_MESSAGE = "Please enter a valid corporate email address.";
    static final String PERSONAL_PROVIDER_MESSAGE =
            "Personal email providers are not accepted. Please use your corporate email.";

    /** Domain part: labels of letters/digits/hyphens, at least one dot, TLD of 2+ letters. */
    private static final String DOMAIN_REGEX = "^[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}$";
    /** Username: allowed punctuation only once-dotted (no leading/trailing/consecutive dots). */
    private static final String USERNAME_REGEX = "^[A-Za-z0-9._%+-]+$";

    private static final List<String> PERSONAL_DOMAIN_PREFIXES = List.of(
            "gmail.com",
            "googlemail.com",
            "yahoo.com",
            "yahoo.co.uk",
            "ymail.com",
            "rocketmail.com",
            "hotmail.com",
            "hotmail.co.uk",
            "outlook.com",
            "live.com",
            "msn.com",
            "aol.com",
            "icloud.com",
            "me.com",
            "mac.com",
            "protonmail.com",
            "proton.me",
            "gmx.com",
            "gmx.net",
            "zoho.com",
            "yandex.com",
            "mail.com",
            "mail.ru",
            "163.com",
            "126.com",
            "qq.com",
            "foxmail.com",
            "web.de",
            "naver.com",
            "tutanota.com"
    );

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) {
            // @NotBlank is responsible for the empty case.
            return true;
        }
        if (!isWellFormed(value)) {
            reject(context, INVALID_FORMAT_MESSAGE);
            return false;
        }
        if (isPersonalDomain(value)) {
            reject(context, PERSONAL_PROVIDER_MESSAGE);
            return false;
        }
        return true;
    }

    private boolean isWellFormed(String value) {
        if (value.chars().anyMatch(Character::isWhitespace)) {
            return false;
        }
        int at = value.indexOf('@');
        if (at <= 0 || at != value.lastIndexOf('@')) {
            // no @ / empty username / @company.com / employee@@company.com
            return false;
        }
        String username = value.substring(0, at);
        String domain = value.substring(at + 1);
        if (!username.matches(USERNAME_REGEX)) {
            return false;
        }
        if (username.startsWith(".") || username.endsWith(".")
                || username.contains("..")) {
            return false;
        }
        return domain.matches(DOMAIN_REGEX);
    }

    private boolean isPersonalDomain(String value) {
        String domain = value.substring(value.lastIndexOf('@') + 1).toLowerCase();
        for (String prefix : PERSONAL_DOMAIN_PREFIXES) {
            if (domain.equals(prefix) || domain.startsWith(prefix + ".")) {
                return true;
            }
        }
        return false;
    }

    private void reject(ConstraintValidatorContext context, String message) {
        context.disableDefaultConstraintViolation();
        context.buildConstraintViolationWithTemplate(message).addConstraintViolation();
    }
}