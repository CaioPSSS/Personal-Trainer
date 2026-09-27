import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapStravaActivityToExecution,
  getAuthorizationUrl,
  StravaActivity,
} from './client';

test('Strava Client: mapStravaActivityToExecution converts distance, time, and pace accurately', () => {
  const sampleActivity: StravaActivity = {
    id: 123456789,
    name: 'Treino Intervalado Matinal',
    distance: 5230, // 5.23 km
    moving_time: 1569, // 26 min 09 sec
    elapsed_time: 1620,
    average_speed: 3.3333, // ~300 sec/km (5:00 /km)
    start_date_local: '2026-10-15T06:30:00Z',
    type: 'Run',
  };

  const result = mapStravaActivityToExecution(sampleActivity);

  assert.equal(result.stravaActivityId, '123456789');
  assert.equal(result.distanceKm, 5.23);
  assert.equal(result.durationSeconds, 1569);
  assert.equal(result.avgPaceSec, 300);
  assert.equal(result.date, '2026-10-15');
  assert.equal(result.source, 'strava');
  assert.equal(result.title, 'Treino Intervalado Matinal');
});

test('Strava Client: pace conversions handle various speeds and fallback calculations', () => {
  // Test speed: 4.1667 m/s (pace = 240 s/km = 4:00/km)
  const fastRun: StravaActivity = {
    id: 'fast-run',
    name: 'Tempo Run',
    distance: 10000,
    moving_time: 2400,
    average_speed: 4.1667,
    type: 'Run',
  };
  const fastMapped = mapStravaActivityToExecution(fastRun);
  assert.equal(fastMapped.avgPaceSec, 240);

  // Test speed: 2.7778 m/s (pace = 360 s/km = 6:00/km)
  const easyRun: StravaActivity = {
    id: 'easy-run',
    name: 'Easy Run',
    distance: 8000,
    moving_time: 2880,
    average_speed: 2.7778,
    type: 'Run',
  };
  const easyMapped = mapStravaActivityToExecution(easyRun);
  assert.equal(easyMapped.avgPaceSec, 360);

  // Fallback when average_speed is 0 or missing, but distance and time exist
  const fallbackRun: StravaActivity = {
    id: 'fallback-run',
    name: 'Treadmill Run',
    distance: 6000,
    moving_time: 1800,
    average_speed: 0,
    type: 'Run',
  };
  const fallbackMapped = mapStravaActivityToExecution(fallbackRun);
  assert.equal(fallbackMapped.avgPaceSec, 300); // 1800s / 6.0km = 300s/km

  // When both speed and distance are 0
  const zeroRun: StravaActivity = {
    id: 'zero-run',
    distance: 0,
    moving_time: 0,
    average_speed: 0,
    type: 'Run',
  };
  const zeroMapped = mapStravaActivityToExecution(zeroRun);
  assert.equal(zeroMapped.avgPaceSec, null);
});

test('Strava Client: cadence doubling properly maps single-leg revolutions to SPM', () => {
  // Strava returns single-leg cadence (e.g. 88 rpm = 176 steps per minute)
  const cadenceRun: StravaActivity = {
    id: 'cadence-run',
    name: 'Long Run',
    distance: 12000,
    moving_time: 4000,
    average_cadence: 88,
    type: 'Run',
  };
  const mapped = mapStravaActivityToExecution(cadenceRun);
  assert.equal(mapped.cadenceAvg, 176);

  // Fractional cadence rounding
  const fractionalCadence: StravaActivity = {
    id: 'cadence-run-2',
    distance: 5000,
    moving_time: 1500,
    average_cadence: 86.6,
    type: 'Run',
  };
  const mappedFractional = mapStravaActivityToExecution(fractionalCadence);
  assert.equal(mappedFractional.cadenceAvg, 173); // 86.6 * 2 = 173.2 -> 173

  // Missing cadence
  const noCadence: StravaActivity = {
    id: 'no-cadence',
    distance: 5000,
    moving_time: 1500,
    type: 'Run',
  };
  assert.equal(mapStravaActivityToExecution(noCadence).cadenceAvg, null);
});

test('Strava Client: heart rate telemetry and environmental metrics extraction', () => {
  const hrRun: StravaActivity = {
    id: 'hr-run',
    name: 'Threshold Session',
    distance: 8000,
    moving_time: 2500,
    has_heartrate: true,
    average_heartrate: 158.4,
    max_heartrate: 176.8,
    total_elevation_gain: 64.5,
    average_temp: 23,
    type: 'Run',
  };

  const mapped = mapStravaActivityToExecution(hrRun);
  assert.equal(mapped.avgHeartRate, 158);
  assert.equal(mapped.maxHeartRate, 177);
  assert.equal(mapped.elevationGainM, 64.5);
  assert.equal(mapped.temperature, 23);

  // When has_heartrate is false
  const noHrRun: StravaActivity = {
    id: 'no-hr',
    distance: 5000,
    moving_time: 1500,
    has_heartrate: false,
    average_heartrate: 150, // Should be ignored because has_heartrate is false
    max_heartrate: 170,
    type: 'Run',
  };
  const mappedNoHr = mapStravaActivityToExecution(noHrRun);
  assert.equal(mappedNoHr.avgHeartRate, null);
  assert.equal(mappedNoHr.maxHeartRate, null);
});

test('Strava Client: split metrics extraction maps kilometer splits with pace and HR', () => {
  const runWithSplits: StravaActivity = {
    id: 'splits-run',
    name: 'Progressivo 10K',
    distance: 3000,
    moving_time: 930,
    type: 'Run',
    splits_metric: [
      {
        split: 1,
        distance: 1000,
        elapsed_time: 320,
        moving_time: 320,
        average_speed: 3.125, // 320 s/km (5:20)
        average_heartrate: 142.2,
        elevation_difference: 8.5,
      },
      {
        split: 2,
        distance: 1000,
        elapsed_time: 310,
        moving_time: 310,
        average_speed: 3.2258, // 310 s/km (5:10)
        average_heartrate: 148.7,
        elevation_difference: -4.0,
      },
      {
        split: 3,
        distance: 1000,
        elapsed_time: 300,
        moving_time: 300,
        average_speed: 3.3333, // 300 s/km (5:00)
        average_heartrate: 156.1,
        elevation_difference: 1.2,
      },
    ],
  };

  const mapped = mapStravaActivityToExecution(runWithSplits);
  assert.ok(mapped.splits);
  assert.equal(mapped.splits.length, 3);

  assert.equal(mapped.splits[0].km, 1);
  assert.equal(mapped.splits[0].paceSec, 320);
  assert.equal(mapped.splits[0].avgHr, 142);
  assert.equal(mapped.splits[0].elevationDiffM, 9);

  assert.equal(mapped.splits[1].km, 2);
  assert.equal(mapped.splits[1].paceSec, 310);
  assert.equal(mapped.splits[1].avgHr, 149);
  assert.equal(mapped.splits[1].elevationDiffM, -4);

  assert.equal(mapped.splits[2].km, 3);
  assert.equal(mapped.splits[2].paceSec, 300);
  assert.equal(mapped.splits[2].avgHr, 156);
  assert.equal(mapped.splits[2].elevationDiffM, 1);

  // When splits_metric is empty or undefined
  const noSplitsRun: StravaActivity = {
    id: 'no-splits',
    distance: 5000,
    moving_time: 1500,
    type: 'Run',
  };
  assert.equal(mapStravaActivityToExecution(noSplitsRun).splits, null);
});

test('Strava Client: getAuthorizationUrl generates valid OAuth2 URL with proper scopes and client ID', () => {
  const urlString = getAuthorizationUrl('http://localhost:3000');
  const url = new URL(urlString);

  assert.equal(url.origin, 'https://www.strava.com');
  assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), '282597');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/api/strava/callback');
  assert.equal(url.searchParams.get('scope'), 'read,activity:read_all');
  assert.equal(url.searchParams.get('approval_prompt'), 'auto');
});
