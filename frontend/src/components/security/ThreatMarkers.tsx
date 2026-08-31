import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { useMap } from 'react-leaflet';
import {
  IpThreatEntry,
  ThreatFilterType,
  TrustedSessionEntry,
  getMarkerColor,
  getMarkerRadius,
  MARKER_COLORS,
  matchesThreatFilter,
  THREAT_TYPE_LABEL,
} from '../../types/threatMap';

/**
 * Imperative Leaflet marker + cluster layer.
 *
 * react-leaflet v5 no longer exposes a built-in MarkerClusterGroup, and the
 * third-party glue packages lag React 19, so we attach a real
 * `L.markerClusterGroup` to the map and rebuild markers imperatively whenever
 * the store data changes. Markers are plain `L.marker` with a custom DivIcon
 * (NOT CircleMarker), clustered via leaflet.markercluster. No blinking.
 */
const ThreatMarkers: React.FC<{
  threats: IpThreatEntry[];
  trustedSessions: TrustedSessionEntry[];
  filter: ThreatFilterType;
}> = ({ threats, trustedSessions, filter }) => {
  const map = useMap();
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      disableClusteringAtZoom: 6,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (count) =>
        L.divIcon({
          className: 'threat-cluster',
          html: `<div><span>${count.getChildCount()}</span></div>`,
          iconSize: [40, 40],
        }),
    });
    cluster.addTo(map);
    clusterRef.current = cluster;
    return () => {
      map.removeLayer(cluster);
      clusterRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();

    const threatEntries = threats.filter((t) => t.latitude != null && t.longitude != null);
    const trustedEntries = trustedSessions.filter((t) => t.latitude != null && t.longitude != null);

    const markers: L.Marker[] = [];

    threatEntries.forEach((t) => {
      if (!matchesThreatFilter(t, filter)) return;
      // In a specific classification view, color the shared IP vector for the
      // selected classification even when a higher-risk event is its overall primary.
      const displayedThreat = filter !== 'ALL' && filter !== 'TRUSTED'
        ? { ...t, primaryThreat: filter }
        : t;
      const marker = buildThreatMarker(displayedThreat);
      if (marker) markers.push(marker);
    });

    if (filter === 'ALL' || filter === 'TRUSTED') {
      trustedEntries.forEach((s) => {
        const marker = buildTrustedMarker(s);
        if (marker) markers.push(marker);
      });
    }

    if (markers.length > 0) {
      cluster.addLayers(markers);
    }
  }, [threats, trustedSessions, filter]);

  return null;
};

function buildThreatMarker(t: IpThreatEntry): L.Marker | null {
  if (t.latitude == null || t.longitude == null) return null;
  const color = MARKER_COLORS[getMarkerColor(t.primaryThreat)];
  const radius = getMarkerRadius(t.severity);
  const html = markerHtml(color.fill, radius, t.ip, t.severity);

  const marker = L.marker([t.latitude, t.longitude], {
    icon: L.divIcon({
      className: 'threat-marker',
      html,
      iconSize: [radius * 2.4, radius * 2.4],
      iconAnchor: [radius * 1.2, radius * 1.2],
    }),
    title: `${t.ip} (${THREAT_TYPE_LABEL[t.primaryThreat]})`,
  });

  marker.bindPopup(() => buildThreatPopup(t));
  return marker;
}

function buildTrustedMarker(s: TrustedSessionEntry): L.Marker | null {
  if (s.latitude == null || s.longitude == null) return null;
  const green = MARKER_COLORS.green;
  const html = markerHtml(green.fill, 8, s.username, 'TRUSTED');

  const marker = L.marker([s.latitude, s.longitude], {
    icon: L.divIcon({
      className: 'threat-marker',
      html,
      iconSize: [19, 19],
      iconAnchor: [10, 10],
    }),
    title: `${s.username} (trusted session)`,
  });

  const content = `
    <div class="threat-popup-card">
      <div class="threat-popup-header" style="border-left-color:${green.fill}">
        <div>
          <div class="threat-popup-ip">${escapeHtml(s.ip)}</div>
          <div class="threat-popup-sub">${escapeHtml(s.username || '')} · ${escapeHtml(s.role || '')}</div>
        </div>
        <span class="threat-popup-badge badge-trusted">TRUSTED</span>
      </div>
      <div class="threat-popup-body">
        <div class="threat-popup-row"><span>Location</span><span>${s.privateIp ? 'LOCAL / PRIVATE IP' : locationText(s.city, s.country)}</span></div>
        ${s.region ? `<div class="threat-popup-row"><span>Region</span><span>${escapeHtml(s.region)}</span></div>` : ''}
        ${s.isp ? `<div class="threat-popup-row"><span>ISP</span><span>${escapeHtml(s.isp)}</span></div>` : ''}
        ${s.asn ? `<div class="threat-popup-row"><span>ASN</span><span>${escapeHtml(s.asn)}</span></div>` : ''}
        ${s.accuracyRadiusKm != null ? `<div class="threat-popup-row"><span>Accuracy</span><span>± ${s.accuracyRadiusKm} km</span></div>` : ''}
        <div class="threat-popup-row"><span>Login</span><span>${formatTime(s.loginTime)}</span></div>
        <div class="threat-popup-row"><span>Last activity</span><span>${formatTime(s.lastActivity)}</span></div>
      </div>
    </div>
  `;
  marker.bindPopup(content, { className: 'threat-popup', maxWidth: 300, minWidth: 260 });
  return marker;
}

function markerHtml(fill: string, radius: number, label: string, severity: string): string {
  return `<div class="threat-dot" style="width:${radius * 2}px;height:${radius * 2}px;background:${fill}" title="${escapeHtml(label)} · ${escapeHtml(severity)}"></div>`;
}

function buildThreatPopup(t: IpThreatEntry): string {
  const color = MARKER_COLORS[getMarkerColor(t.primaryThreat)];
  const severityBadge = severityClass(t.severity);

  const typesHtml = (t.threatTypes || [])
    .map(
      (tc) =>
        `<div class="threat-popup-row"><span>${escapeHtml(THREAT_TYPE_LABEL[tc.type] || tc.type)}</span><span class="threat-count">× ${tc.count}</span></div>`
    )
    .join('');

  const geoHtml = t.latitude != null && t.longitude != null
    ? geoDetailRows(t)
    : `<div class="threat-popup-row"><span>Location</span><span class="threat-local">${t.privateIp ? 'LOCAL / PRIVATE IP — not geolocatable' : 'Unknown (provider could not resolve)'}</span></div>`;

  return `
    <div class="threat-popup-card">
      <div class="threat-popup-header" style="border-left-color:${color.fill}">
        <div>
          <div class="threat-popup-ip">${escapeHtml(t.ip)}</div>
          <div class="threat-popup-sub">${locationText(t.city, t.country)}</div>
        </div>
        <span class="threat-popup-badge ${t.status === 'BLOCKED' ? 'badge-blocked' : 'badge-detected'}">${t.status}</span>
      </div>
      <div class="threat-popup-body">
        ${geoHtml}
        ${typesHtml}
        <div class="threat-popup-row"><span>Severity</span><span class="threat-severity ${severityBadge}">${t.severity}</span></div>
        <div class="threat-popup-row"><span>Events</span><span>${t.eventCount}</span></div>
        <div class="threat-popup-row"><span>First seen</span><span>${formatTime(t.firstSeen)}</span></div>
        <div class="threat-popup-row"><span>Last seen</span><span>${formatTime(t.lastSeen)}</span></div>
        <div class="threat-popup-row"><span>Source</span><span>${escapeHtml(t.source || '—')}</span></div>
      </div>
    </div>
  `;
}

function geoDetailRows(t: IpThreatEntry): string {
  const rows: string[] = [];
  rows.push(`<div class="threat-popup-row"><span>Location</span><span>${locationText(t.city, t.country)}</span></div>`);
  if (t.region) rows.push(`<div class="threat-popup-row"><span>Region</span><span>${escapeHtml(t.region)}</span></div>`);
  if (t.timezone) rows.push(`<div class="threat-popup-row"><span>Timezone</span><span>${escapeHtml(t.timezone)}</span></div>`);
  if (t.isp) rows.push(`<div class="threat-popup-row"><span>ISP</span><span>${escapeHtml(t.isp)}</span></div>`);
  if (t.asn) rows.push(`<div class="threat-popup-row"><span>ASN</span><span>${escapeHtml(t.asn)}</span></div>`);
  if (t.accuracyRadiusKm != null) {
    rows.push(`<div class="threat-popup-row"><span>Accuracy</span><span>± ${t.accuracyRadiusKm} km</span></div>`);
  }
  if (t.confidence != null) {
    rows.push(`<div class="threat-popup-row"><span>Confidence</span><span>${t.confidence}%</span></div>`);
  }
  rows.push(`<div class="threat-popup-row"><span>Approx.</span><span>IP geolocation is approximate (ISP/network location)</span></div>`);
  return rows.join('');
}

function locationText(city: string | null, country: string | null): string {
  if (city && country) return `${escapeHtml(city)}, ${escapeHtml(country)}`;
  if (city) return escapeHtml(city);
  if (country) return escapeHtml(country);
  return 'Location: Unknown';
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '—';
  }
}

function severityClass(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'sev-critical';
    case 'HIGH': return 'sev-high';
    case 'MEDIUM': return 'sev-medium';
    default: return 'sev-low';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default ThreatMarkers;
