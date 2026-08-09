package com.photonicomega.facilities.module.documents.service;

import com.photonicomega.facilities.exception.FileStorageException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Writes uploaded documents to the configured storage root.
 *
 * <p>Two things here are deliberate:
 * <ul>
 *   <li>The stored filename is always a freshly generated UUID plus a
 *       sanitised extension. The client-supplied name is never used to
 *       build a path, so {@code ../../etc/passwd} style traversal is
 *       impossible by construction. The original name is kept on the
 *       entity in {@code Document.fileName} for display and download.</li>
 *   <li>If the primary root cannot be written to (typical on a dev
 *       machine, where the default {@code /mnt/fileserver/facilities}
 *       does not exist) the write falls back to a configurable temp
 *       directory and logs a warning, rather than failing the upload.</li>
 * </ul>
 */
@Service
@Slf4j
public class DocumentStorageService {

    /** Extensions accepted by the upload endpoint. */
    public static final List<String> ALLOWED_EXTENSIONS = List.of(
            "pdf", "png", "jpg", "jpeg", "doc", "docx", "xls", "xlsx", "txt");

    /** 100 MB, matching spring.servlet.multipart.max-file-size. */
    public static final long MAX_FILE_SIZE_BYTES = 100L * 1024L * 1024L;

    private final String primaryPath;
    private final String fallbackPath;

    public DocumentStorageService(
            @Value("${app.storage.primary.path}") String primaryPath,
            @Value("${app.storage.fallback.path:${java.io.tmpdir}/facilities-documents}") String fallbackPath) {
        this.primaryPath = primaryPath;
        this.fallbackPath = fallbackPath;
    }

    /**
     * Result of a successful store: where the bytes landed and under what name.
     *
     * @param storedFilename the generated UUID filename on disk
     * @param absolutePath   full path, persisted to Document.filePath
     * @param usedFallback   true when the primary root was unusable
     */
    public record StoredFile(String storedFilename, String absolutePath, boolean usedFallback) {
    }

    /**
     * Returns the lower-cased extension of the given filename, or an empty
     * string when there is none.
     */
    public String extensionOf(String originalFilename) {
        if (originalFilename == null) {
            return "";
        }
        int dot = originalFilename.lastIndexOf('.');
        if (dot < 0 || dot == originalFilename.length() - 1) {
            return "";
        }
        return originalFilename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    public boolean isAllowedExtension(String extension) {
        return ALLOWED_EXTENSIONS.contains(extension);
    }

    /**
     * Writes the upload under a generated UUID filename, trying the primary
     * root first and the fallback temp directory second.
     *
     * @throws FileStorageException when neither location can be written to
     */
    public StoredFile store(MultipartFile file) {
        String extension = extensionOf(file.getOriginalFilename());
        String storedFilename = UUID.randomUUID() + (extension.isEmpty() ? "" : "." + extension);

        try {
            Path target = writeTo(primaryPath, storedFilename, file);
            return new StoredFile(storedFilename, target.toString(), false);
        } catch (IOException | RuntimeException primaryFailure) {
            log.warn("Primary storage path '{}' unavailable ({}), falling back to '{}'",
                    primaryPath, primaryFailure.getMessage(), fallbackPath);
        }

        try {
            Path target = writeTo(fallbackPath, storedFilename, file);
            log.warn("Document '{}' was written to the fallback location {}",
                    file.getOriginalFilename(), target);
            return new StoredFile(storedFilename, target.toString(), true);
        } catch (IOException | RuntimeException fallbackFailure) {
            throw new FileStorageException(
                    "Could not store the uploaded file in either the primary or fallback location",
                    fallbackFailure);
        }
    }

    /** Opens a stored file for streaming back to the client. */
    public InputStream openStream(String absolutePath) throws IOException {
        Path path = Paths.get(absolutePath);
        if (!Files.exists(path) || !Files.isReadable(path)) {
            throw new IOException("File not found or not readable: " + absolutePath);
        }
        return Files.newInputStream(path);
    }

    public boolean exists(String absolutePath) {
        if (absolutePath == null || absolutePath.isBlank()) {
            return false;
        }
        return Files.exists(Paths.get(absolutePath));
    }

    private Path writeTo(String root, String storedFilename, MultipartFile file) throws IOException {
        Path directory = Paths.get(root).toAbsolutePath().normalize();
        Files.createDirectories(directory);
        Path target = directory.resolve(storedFilename).normalize();

        // Defence in depth: the filename is generated, but assert anyway.
        if (!target.startsWith(directory)) {
            throw new FileStorageException("Resolved path escaped the storage root");
        }

        try (InputStream in = file.getInputStream()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return target;
    }
}
