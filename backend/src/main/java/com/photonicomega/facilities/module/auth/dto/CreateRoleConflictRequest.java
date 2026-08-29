package com.photonicomega.facilities.module.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record CreateRoleConflictRequest(
        @NotNull UUID firstRoleId,
        @NotNull UUID secondRoleId,
        @NotBlank @Size(max = 100) String code,
        @Size(max = 500) String description
) {
}
