package com.photonicomega.facilities.module.security.util;

import com.photonicomega.facilities.module.security.service.geo.IpGeo;

import java.util.ArrayList;
import java.util.List;

/**
 * Serializes an {@link IpGeo} into a compact JSON string that always fits the
 * {@code security_logs.geo_location} {@code varchar(255)} column.
 *
 * <p>The geolocation provider may return long ISP/ASN names; we bound each
 * value and the total payload so the write-back path never fails the audit
 * row with a "value too long for type character varying(255)" error.
 */
public final class GeoJson {

    /** Hard cap for the whole JSON payload (must be < 255). */
    private static final int MAX_TOTAL = 240;

    private static final int MAX_VALUE = 40;

    private GeoJson() {
    }

    public static String toCompactJson(IpGeo geo) {
        if (geo == null) {
            return null;
        }
        List<String> parts = new ArrayList<>();
        put(parts, "latitude", geo.latitude() != null ? geo.latitude().toString() : null);
        put(parts, "longitude", geo.longitude() != null ? geo.longitude().toString() : null);
        put(parts, "country", geo.country());
        put(parts, "countryCode", geo.countryCode());
        put(parts, "region", geo.region());
        put(parts, "city", geo.city());
        put(parts, "timezone", geo.timezone());
        put(parts, "isp", geo.isp());
        put(parts, "asn", geo.asn());
        put(parts, "accuracyRadiusKm", geo.accuracyRadiusKm() != null ? geo.accuracyRadiusKm().toString() : null);
        put(parts, "confidence", geo.confidence() != null ? geo.confidence().toString() : null);
        put(parts, "ipVersion", Integer.toString(geo.ipVersion()));

        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < parts.size(); i++) {
            if (i > 0) {
                sb.append(",");
            }
            sb.append(parts.get(i));
        }
        sb.append("}");
        if (sb.length() > MAX_TOTAL) {
            return sb.substring(0, MAX_TOTAL) + "}";
        }
        return sb.toString();
    }

    private static void put(List<String> parts, String key, String value) {
        String v = value;
        if (v == null || v.isBlank()) {
            v = "";
        }
        if (v.length() > MAX_VALUE) {
            v = v.substring(0, MAX_VALUE);
        }
        // JSON-escape the minimal set.
        v = v.replace("\\", "\\\\").replace("\"", "\\\"");
        parts.add("\"" + key + "\":\"" + v + "\"");
    }
}