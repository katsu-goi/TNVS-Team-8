package com.photonicomega.facilities.module.security.util;

import jakarta.servlet.http.HttpServletRequest;

import java.util.regex.Pattern;

/**
 * Secure client-IP extraction.
 *
 * <p>Production traffic reaches this backend through the Cloudflare quick
 * tunnel and local development through the Vite proxy - both terminate on
 * loopback, so the immediate {@code remoteAddr} is always {@code 127.0.0.1}
 * (or {@code ::1}). The real client IP arrives in {@code X-Forwarded-For}
 * (a comma-separated chain, leftmost = original client) or {@code X-Real-IP}.
 *
 * <p>To avoid blindly trusting arbitrary client-supplied headers, forwarded
 * headers are only honored when the immediate peer is itself loopback/private
 * (i.e. the request is provably behind a proxy/tunnel we control). A request
 * that lands directly with a public {@code remoteAddr} is never allowed to
 * spoof its source via {@code X-Forwarded-For}.
 */
public final class ClientIpResolver {

    private static final Pattern IPV4 = Pattern.compile("^\\d{1,3}(\\.\\d{1,3}){3}$");

    private ClientIpResolver() {
    }

    /**
     * Result of IP resolution.
     *
     * @param ip          the resolved client IP (IPv4 or IPv6, unmasked)
     * @param ipVersion   4 or 6
     * @param isPrivate   true when the IP is loopback / RFC 1918 / link-local / CGNAT
     */
    public record ResolvedIp(String ip, int ipVersion, boolean isPrivate) {
    }

    /**
     * Resolves the real client IP for the given request.
     */
    public static ResolvedIp resolve(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        boolean behindProxy = isLoopbackOrPrivate(remote);

        String ip = null;
        if (behindProxy) {
            ip = firstForwardedIp(request.getHeader("X-Forwarded-For"));
            if (ip == null) {
                ip = trimToNull(request.getHeader("X-Real-IP"));
            }
        }
        if (ip == null) {
            ip = remote;
        }
        return new ResolvedIp(ip, ip.contains(":") ? 6 : 4, isPrivateOrLocal(ip));
    }

    /**
     * True when the IP is loopback, RFC 1918 private, link-local, CGNAT or
     * IPv6 equivalents - i.e. an address that a public geolocation provider
     * will never resolve and that must not be treated as a geographic source.
     */
    public static boolean isPrivateOrLocal(String ip) {
        if (ip == null || ip.isBlank()) {
            return true;
        }
        String value = ip.trim();
        if (!IPV4.matcher(value).matches()) {
            String lower = value.toLowerCase(java.util.Locale.ROOT);
            return lower.startsWith("0:") || lower.startsWith("::")
                    || lower.startsWith("fc") || lower.startsWith("fd")
                    || lower.startsWith("fe80:") || lower.equals("::1");
        }
        try {
            String[] parts = value.split("\\.");
            int a = Integer.parseInt(parts[0]);
            int b = Integer.parseInt(parts[1]);
            if (a == 127 || a == 10 || a == 0 || a == 255) return true;
            if (a == 192 && b == 168) return true;
            if (a == 172 && b >= 16 && b <= 31) return true;
            if (a == 169 && b == 254) return true;
            if (a == 100 && b >= 64 && b <= 127) return true;
            return false;
        } catch (NumberFormatException | ArrayIndexOutOfBoundsException e) {
            return true;
        }
    }

    private static boolean isLoopbackOrPrivate(String ip) {
        if (ip == null || ip.isBlank()) {
            return false;
        }
        String value = ip.trim();
        return value.equals("127.0.0.1") || value.equals("::1")
                || value.equals("0:0:0:0:0:0:0:1") || value.equals("localhost")
                || isPrivateOrLocal(value);
    }

    private static String firstForwardedIp(String header) {
        if (header == null || header.isBlank()) {
            return null;
        }
        String[] chain = header.split(",");
        for (String entry : chain) {
            String candidate = trimToNull(entry);
            if (candidate != null) {
                return candidate;
            }
        }
        return null;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}