package com.photonicomega.facilities.module.auth.dto;

import com.photonicomega.facilities.common.validation.CorporateEmail;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class HrAssistanceRequestDto {
    @NotBlank(message = "Full name is required.")
    @Pattern(regexp = "^[A-Za-z]+(?: [A-Za-z]+)*$", message = "Please enter a valid name using letters and spaces only.")
    @Size(max = 200, message = "Name must be at most 200 characters")
    private String name;

    public void setName(String name) {
        this.name = name == null ? null : name.trim();
    }

    @NotBlank(message = "Corporate email is required.")
    @CorporateEmail
    @Size(max = 255, message = "Email must be at most 255 characters")
    private String email;

    @NotBlank(message = "Subject is required")
    @Size(max = 300, message = "Subject must be at most 300 characters")
    private String subject;

    @NotBlank(message = "Message is required")
    @Size(max = 5000, message = "Message must be at most 5000 characters")
    private String message;
}
