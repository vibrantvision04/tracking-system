import React, { useMemo } from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export interface VehicleMarker {
  vehicle_id: number | string;
  vehicle_number: string;
  lat: number;
  lng: number;
  speed: number;
  status?: string;
  driver_name?: string;
  last_update?: string;
}

interface VehicleMapViewProps {
  vehicles: VehicleMarker[];
  onSelect?: (vehicleId: number | string) => void;
  title?: string;
  height?: number;
}

// Status → colour. Moving (speed>0) green, idle amber, stopped red.
function statusColor(v: VehicleMarker): string {
  if (v.speed > 0) return '#2E7D32';
  if ((v.status || '').toLowerCase() === 'idle') return '#F57F17';
  return '#C62828';
}

// A valid GPS fix (skip 0,0 / null island and out-of-range values).
function hasValidFix(v: VehicleMarker): boolean {
  return (
    typeof v.lat === 'number' && typeof v.lng === 'number' &&
    Math.abs(v.lat) > 0.0001 && Math.abs(v.lng) > 0.0001 &&
    Math.abs(v.lat) <= 90 && Math.abs(v.lng) <= 180
  );
}

export default function VehicleMapView({ vehicles, onSelect, title, height = 300 }: VehicleMapViewProps) {
  const located = useMemo(() => vehicles.filter(hasValidFix), [vehicles]);

  const bounds = useMemo(() => {
    if (located.length > 0) {
      const lats = located.map((v) => v.lat);
      const lngs = located.map((v) => v.lng);
      return {
        minLat: Math.min(...lats), maxLat: Math.max(...lats),
        minLng: Math.min(...lngs), maxLng: Math.max(...lngs),
      };
    }
    return { minLat: 26.89, maxLat: 26.93, minLng: 75.76, maxLng: 75.80 };
  }, [located]);

  const single = located.length === 1;
  const fitBoundsCode = single
    ? `map.setView([${located[0].lat}, ${located[0].lng}], 15);`
    : `map.fitBounds([[${bounds.minLat}, ${bounds.minLng}], [${bounds.maxLat}, ${bounds.maxLng}]], {padding:[30,30], maxZoom:16});`;

  const vehiclesJson = JSON.stringify(
    located.map((v) => ({
      id: v.vehicle_id,
      lat: v.lat,
      lng: v.lng,
      label: (v.vehicle_number || '').slice(-4),
      reg: v.vehicle_number || '',
      color: statusColor(v),
      speed: v.speed,
    }))
  );

  const html = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>*{margin:0;padding:0}html,body,#map{width:100%;height:100%}.leaflet-control-attribution{display:none!important}</style>
</head><body><div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',{maxZoom:20}).addTo(map);
${fitBoundsCode}
var vehicles=${vehiclesJson};
vehicles.forEach(function(v){
  var icon=L.divIcon({className:'',html:'<div style="min-width:30px;height:30px;padding:0 4px;border-radius:15px;background:'+v.color+';border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);">'+v.label+'</div>',iconSize:[30,30],iconAnchor:[15,15]});
  var m=L.marker([v.lat,v.lng],{icon:icon}).addTo(map);
  m.bindPopup('<b>'+v.reg+'</b><br/>Speed: '+(v.speed||0).toFixed(1)+' km/h',{autoPan:false});
  m.on('click',function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'vehicleSelect',id:v.id}));});
});
<\/script></body></html>`;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'vehicleSelect' && onSelect) onSelect(data.id);
    } catch {}
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { height }]}>
        <View style={[styles.map, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: '#616161', fontSize: 14 }}>Map available on mobile device</Text>
          <Text style={{ color: '#9e9e9e', fontSize: 12, marginTop: 4 }}>{located.length} vehicle(s) located</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      {title && (
        <View style={styles.titleBadge}>
          <Text style={styles.titleBadgeText}>{title}</Text>
        </View>
      )}
      <WebView
        source={{ html }}
        style={styles.map}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
      />
      {located.length === 0 && (
        <View style={styles.noFixOverlay} pointerEvents="none">
          <Text style={styles.noFixText}>No vehicles with a live GPS location yet</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#eceff1' },
  map: { flex: 1 },
  titleBadge: {
    position: 'absolute', top: 8, left: 8, zIndex: 10,
    backgroundColor: 'rgba(21, 101, 192, 0.9)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4,
  },
  titleBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: 'bold' },
  noFixOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  noFixText: { color: '#607d8b', fontSize: 12, fontWeight: '600', backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
});
