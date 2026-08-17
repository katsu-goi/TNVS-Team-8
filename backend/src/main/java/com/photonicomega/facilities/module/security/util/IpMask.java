package com.photonicomega.facilities.module.security.util;

/**
 * IP privacy helpers. The backend always uses the real IP internally for
 * aggregation/geolocation, but only masked forms are ever returned to the
 * frontend.
 */
public final class IpMask {

    private IpMask() {
    }

    /**
     * Masks an IPv4 or IPv6 address so the host portion is hidden.
     * <ul>
     *   <li>{@code 136.158.62.29} → {@code 136.158.xxx.xxx}</li>
     *   <li>{@code 2001:db8:85a3:0:0:8a2e:370:7334} → {@code 2001:db8:85a3:0:xxxx:xxxx:xxxx:xxxx}</li>
     *   <li>{@code ::1} → {@code xxxx:xxxx:xxxx:xxxx}</li>
     * </ul>
     *
     * @param ip raw IP address
     * @return masked address, or the original value when it cannot be parsed
     */
    public static String maskIp(String ip) {
        if (ip == null || ip.isBlank()) {
            return ip;
        }
        String trimmed = ip.trim();
        if (trimmed.contains(".") && !trimmed.contains(":")) {
            return maskIpv4(trimmed);
        }
        if (trimmed.contains(":")) {
            return maskIpv6(trimmed);
        }
        return trimmed;
    }

    private static String maskIpv4(String ip) {
        String[] parts = ip.split("\\.");
        if (parts.length != 4) {
            return ip;
        }
        // Keep first two octets, mask the rest. Short addresses (e.g. 127.0.0.1)
        // keep their network octets as-is so markers stay distinguishable.
        return parts[0] + "." + parts[1] + ".xxx.xxx";
    }

    private static String maskIpv6(String ip) {
        // Expand "::" so we can count groups reliably.
        String expanded = expandIpv6(ip);
        String[] groups = expanded.split(":");
        if (groups.length < 4) {
            return "xxxx:xxxx:xxxx:xxxx";
        }
        int maskFrom = Math.max(4, groups.length - 2);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < groups.length; i++) {
            if (i > 0) {
                sb.append(":");
            }
            if (i < maskFrom && !groups[i].isBlank()) {
                sb.append(groups[i]);
            } else {
                sb.append("xxxx");
            }
        }
        return sb.toString();
    }

    /**
     * Expands the {@code ::} compression in an IPv6 string. Returns the raw
     * value when the input does not contain a double colon (best-effort).
     */
    private static String expandIpv6(String ip) {
        int doubleColon = ip.indexOf("::");
        if (doubleColon < 0) {
            return ip;
        }
        String left = ip.substring(0, doubleColon);
        String right = ip.substring(doubleColon + 2);
        int leftGroups = left.isBlank() ? 0 : left.split(":").length;
        int rightGroups = right.isBlank() ? 0 : right.split(":").length;
        int zeros = 8 - leftGroups - rightGroups;
        if (zeros < 0) {
            zeros = 1;
        }
        StringBuilder middle = new StringBuilder();
        for (int i = 0; i < zeros; i++) {
            if (middle.length() > 0) {
                middle.append(":");
            }
            middle.append("0");
        }
        String join = (left.isBlank() ? "" : left + ":") + middle + (right.isBlank() ? "" : ":" + right);
        return join;
    }
}