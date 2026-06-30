import React, { useMemo } from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { LanePoint } from '../types';

interface MapViewProps {
  lanePoints: LanePoint[];
  onSelectPoint: (point: LanePoint) => void;
  isSequential: boolean;
  wardName?: string;
  currentPosition?: { lat: number; lng: number } | null;
}

const STATUS_COLORS: Record<string, string> = {
  achieved: '#10b981',
  pending: '#f59e0b',
  missed: '#ef4444',
  upcoming: '#94a3b8',
};

// WebView is loaded lazily inside the component to avoid crashes at module evaluation time

export default function MapView({
  lanePoints,
  onSelectPoint,
  isSequential,
  wardName,
  currentPosition,
}: MapViewProps) {
  const sortedPoints = useMemo(
    () => [...lanePoints].sort((a, b) => a.sequence_number - b.sequence_number),
    [lanePoints]
  );

  const bounds = useMemo(() => {
    if (currentPosition) {
      return { lat: currentPosition.lat, lng: currentPosition.lng };
    }
    if (sortedPoints.length > 0) {
      const lats = sortedPoints.map((p) => p.latitude);
      const lngs = sortedPoints.map((p) => p.longitude);
      return {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLng: Math.min(...lngs),
        maxLng: Math.max(...lngs),
      };
    }
    return { minLat: 26.89, maxLat: 26.93, minLng: 75.76, maxLng: 75.80 };
  }, [sortedPoints, currentPosition]);

  const fitBoundsCode = 'lat' in bounds
    ? `map.setView([${bounds.lat}, ${bounds.lng}], 15);`
    : `map.fitBounds([[${(bounds as any).minLat}, ${(bounds as any).minLng}], [${(bounds as any).maxLat}, ${(bounds as any).maxLng}]], {padding: [20,20]});`;

  const pointsJson = JSON.stringify(
    sortedPoints.map((p) => ({
      id: p.id,
      lat: p.latitude,
      lng: p.longitude,
      seq: p.sequence_number,
      status: p.status,
      color: STATUS_COLORS[p.status] || STATUS_COLORS.upcoming,
    }))
  );

  const routeCoordsJson = JSON.stringify(
    sortedPoints.map((p) => [p.latitude, p.longitude])
  );

  const currentPosCode = currentPosition
    ? `L.marker([${currentPosition.lat}, ${currentPosition.lng}], {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:14px;height:14px;border-radius:50%;background:#1565C0;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        })
      }).addTo(map).bindPopup('Your Vehicle');`
    : '';

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
var routeCoords=${routeCoordsJson};
if(routeCoords.length>1){L.polyline(routeCoords,{color:'#1565C0',weight:3,opacity:0.8}).addTo(map);}
var points=${pointsJson};
var markerLayer=L.layerGroup().addTo(map);
function drawMarkers(){
  markerLayer.clearLayers();
  var zoom=map.getZoom();
  var b=map.getBounds();
  if(zoom<14)return;
  var r=6,showNum=false;
  if(zoom>=18){r=10;showNum=true;}
  else if(zoom>=17){r=8;showNum=true;}
  else if(zoom>=16){r=7;showNum=true;}
  else if(zoom>=15){r=5;showNum=false;}
  else{r=4;showNum=false;}
  points.forEach(function(p){
    if(!b.contains([p.lat,p.lng]))return;
    var m;
    if(showNum){
      var s=r*2+4;
      var icon=L.divIcon({className:'',html:'<div style="width:'+s+'px;height:'+s+'px;border-radius:50%;background:'+p.color+';border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:'+(s>16?'9':'7')+'px;font-weight:bold;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);">'+p.seq+'</div>',iconSize:[s,s],iconAnchor:[s/2,s/2]});
      m=L.marker([p.lat,p.lng],{icon:icon}).addTo(markerLayer);
    }else{
      m=L.circleMarker([p.lat,p.lng],{radius:r,fillColor:p.color,color:'#fff',weight:1,opacity:0.9,fillOpacity:0.85}).addTo(markerLayer);
    }
    m.bindPopup('<b>#'+p.seq+'</b><br/>Status: <span style="color:'+p.color+';font-weight:bold;">'+p.status+'</span>',{autoPan:false});
    m.on('click',function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'pointSelect',id:p.id}));});
  });
}
map.on('zoomend moveend',drawMarkers);
drawMarkers();
${currentPosCode}
<\/script></body></html>`;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'pointSelect') {
        const point = lanePoints.find((p) => p.id === data.id);
        if (point) onSelectPoint(point);
      }
    } catch {}
  };

  // Web fallback (WebView is native-only)
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <View style={[styles.map, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: '#616161', fontSize: 14 }}>Map available on mobile device</Text>
          <Text style={{ color: '#9e9e9e', fontSize: 12, marginTop: 4 }}>
            {sortedPoints.length} lane points loaded
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {wardName && (
        <View style={styles.wardBadge}>
          <Text style={styles.wardBadgeText}>{wardName}</Text>
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

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#10b981' }]} />
          <Text style={styles.legendText}>Achieved</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#f59e0b' }]} />
          <Text style={styles.legendText}>Pending</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
          <Text style={styles.legendText}>Missed</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#94a3b8' }]} />
          <Text style={styles.legendText}>Upcoming</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 400,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#eceff1',
  },
  map: {
    flex: 1,
  },
  wardBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 10,
    backgroundColor: 'rgba(21, 101, 192, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  wardBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#ffffff',
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
  legendText: {
    fontSize: 10,
    color: '#212121',
    fontWeight: '600',
  },
});
