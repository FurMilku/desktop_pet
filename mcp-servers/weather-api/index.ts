/**
 * Weather API MCP Server
 * T077 [P] [US4] 实现 weather-api MCP服务器
 *
 * 提供天气查询工具：
 * - get_weather: 获取当前天气
 * - get_forecast: 获取天气预报
 * - get_air_quality: 获取空气质量
 * - search_city: 搜索城市
 *
 * @see specs/001-desktop-3d-pet/spec.md FR-015
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import * as https from 'https';

// ============================================================================
// 类型定义
// ============================================================================

interface MCPMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
}

interface WeatherData {
  city: string;
  country: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  windDirection: string;
  description: string;
  icon: string;
  visibility: number;
  clouds: number;
  sunrise: string;
  sunset: string;
  updatedAt: string;
}

interface ForecastDay {
  date: string;
  tempMin: number;
  tempMax: number;
  humidity: number;
  description: string;
  icon: string;
  precipitation: number;
}

interface AirQuality {
  aqi: number;
  level: 'good' | 'moderate' | 'unhealthy-sensitive' | 'unhealthy' | 'very-unhealthy' | 'hazardous';
  pm25: number;
  pm10: number;
  o3: number;
  no2: number;
  so2: number;
  co: number;
}

interface CityInfo {
  name: string;
  country: string;
  state?: string;
  lat: number;
  lon: number;
}

interface WeatherCache {
  version: number;
  defaultCity?: string;
  cache: Record<string, {
    weather?: WeatherData;
    forecast?: ForecastDay[];
    airQuality?: AirQuality;
    cachedAt: string;
  }>;
}

// ============================================================================
// 工具定义
// ============================================================================

const TOOLS: MCPTool[] = [
  {
    name: 'get_weather',
    description: '获取指定城市的当前天气',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称（如 "Beijing", "Shanghai", "北京"）',
        },
        units: {
          type: 'string',
          enum: ['metric', 'imperial'],
          description: '单位制：metric（公制，摄氏度）或 imperial（英制，华氏度），默认 metric',
        },
      },
      required: ['city'],
    },
  },
  {
    name: 'get_forecast',
    description: '获取指定城市的天气预报',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称',
        },
        days: {
          type: 'number',
          description: '预报天数（1-7），默认5',
        },
        units: {
          type: 'string',
          enum: ['metric', 'imperial'],
          description: '单位制',
        },
      },
      required: ['city'],
    },
  },
  {
    name: 'get_air_quality',
    description: '获取指定城市的空气质量',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称',
        },
      },
      required: ['city'],
    },
  },
  {
    name: 'search_city',
    description: '搜索城市',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词',
        },
        limit: {
          type: 'number',
          description: '返回结果数量，默认5',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'set_default_city',
    description: '设置默认城市',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '默认城市名称',
        },
      },
      required: ['city'],
    },
  },
  {
    name: 'get_weather_summary',
    description: '获取天气摘要（适合语音播报）',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称，不提供则使用默认城市',
        },
      },
    },
  },
];

// ============================================================================
// 资源定义
// ============================================================================

const RESOURCES: MCPResource[] = [
  {
    uri: 'weather://current',
    name: '当前天气',
    description: '默认城市的当前天气',
    mimeType: 'application/json',
  },
  {
    uri: 'weather://forecast',
    name: '天气预报',
    description: '默认城市的天气预报',
    mimeType: 'application/json',
  },
  {
    uri: 'weather://air-quality',
    name: '空气质量',
    description: '默认城市的空气质量',
    mimeType: 'application/json',
  },
];

// ============================================================================
// 数据存储
// ============================================================================

const DATA_DIR = path.join(os.homedir(), '.desktop-pet', 'mcp-data');
const WEATHER_FILE = path.join(DATA_DIR, 'weather.json');
const CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadWeatherCache(): WeatherCache {
  ensureDataDir();
  
  if (!fs.existsSync(WEATHER_FILE)) {
    return { version: 1, defaultCity: 'Beijing', cache: {} };
  }
  
  try {
    const data = fs.readFileSync(WEATHER_FILE, 'utf-8');
    return JSON.parse(data) as WeatherCache;
  } catch {
    return { version: 1, defaultCity: 'Beijing', cache: {} };
  }
}

function saveWeatherCache(cache: WeatherCache): void {
  ensureDataDir();
  fs.writeFileSync(WEATHER_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

function getCacheKey(city: string): string {
  return city.toLowerCase().trim();
}

function isCacheValid(cachedAt: string): boolean {
  return Date.now() - new Date(cachedAt).getTime() < CACHE_DURATION;
}

// ============================================================================
// 模拟天气数据（实际应用中应使用真实API）
// ============================================================================

// 城市数据库（模拟）
const CITY_DATABASE: Record<string, CityInfo> = {
  beijing: { name: 'Beijing', country: 'CN', lat: 39.9042, lon: 116.4074 },
  shanghai: { name: 'Shanghai', country: 'CN', lat: 31.2304, lon: 121.4737 },
  guangzhou: { name: 'Guangzhou', country: 'CN', lat: 23.1291, lon: 113.2644 },
  shenzhen: { name: 'Shenzhen', country: 'CN', lat: 22.5431, lon: 114.0579 },
  hangzhou: { name: 'Hangzhou', country: 'CN', lat: 30.2741, lon: 120.1551 },
  nanjing: { name: 'Nanjing', country: 'CN', lat: 32.0603, lon: 118.7969 },
  chengdu: { name: 'Chengdu', country: 'CN', lat: 30.5728, lon: 104.0668 },
  tokyo: { name: 'Tokyo', country: 'JP', lat: 35.6762, lon: 139.6503 },
  'new york': { name: 'New York', country: 'US', state: 'NY', lat: 40.7128, lon: -74.0060 },
  london: { name: 'London', country: 'GB', lat: 51.5074, lon: -0.1278 },
  paris: { name: 'Paris', country: 'FR', lat: 48.8566, lon: 2.3522 },
  '北京': { name: 'Beijing', country: 'CN', lat: 39.9042, lon: 116.4074 },
  '上海': { name: 'Shanghai', country: 'CN', lat: 31.2304, lon: 121.4737 },
  '广州': { name: 'Guangzhou', country: 'CN', lat: 23.1291, lon: 113.2644 },
  '深圳': { name: 'Shenzhen', country: 'CN', lat: 22.5431, lon: 114.0579 },
  '杭州': { name: 'Hangzhou', country: 'CN', lat: 30.2741, lon: 120.1551 },
  '成都': { name: 'Chengdu', country: 'CN', lat: 30.5728, lon: 104.0668 },
};

// 天气描述
const WEATHER_CONDITIONS = [
  { description: '晴朗', icon: '☀️' },
  { description: '多云', icon: '⛅' },
  { description: '阴天', icon: '☁️' },
  { description: '小雨', icon: '🌧️' },
  { description: '中雨', icon: '🌧️' },
  { description: '雷阵雨', icon: '⛈️' },
  { description: '小雪', icon: '🌨️' },
  { description: '雾霾', icon: '🌫️' },
];

// 风向
const WIND_DIRECTIONS = ['北风', '东北风', '东风', '东南风', '南风', '西南风', '西风', '西北风'];

function generateMockWeather(city: string, units: string = 'metric'): WeatherData {
  const cityInfo = findCity(city);
  const cityName = cityInfo?.name || city;
  const country = cityInfo?.country || 'Unknown';
  const lat = cityInfo?.lat || 0;
  
  // 基于纬度生成合理的温度范围
  const baseTemp = 20 - Math.abs(lat - 30) * 0.5;
  const seasonOffset = Math.sin((new Date().getMonth() - 3) * Math.PI / 6) * 15;
  const dailyOffset = Math.sin((new Date().getHours() - 6) * Math.PI / 12) * 5;
  
  let temperature = baseTemp + seasonOffset + dailyOffset + (Math.random() - 0.5) * 10;
  temperature = Math.round(temperature * 10) / 10;
  
  if (units === 'imperial') {
    temperature = Math.round(temperature * 9 / 5 + 32);
  }
  
  const condition = WEATHER_CONDITIONS[Math.floor(Math.random() * WEATHER_CONDITIONS.length)];
  const windDir = WIND_DIRECTIONS[Math.floor(Math.random() * WIND_DIRECTIONS.length)];
  
  const now = new Date();
  const sunrise = new Date(now);
  sunrise.setHours(6, Math.floor(Math.random() * 30), 0, 0);
  const sunset = new Date(now);
  sunset.setHours(18, Math.floor(Math.random() * 30), 0, 0);
  
  return {
    city: cityName,
    country,
    temperature,
    feelsLike: temperature + (Math.random() - 0.5) * 4,
    humidity: Math.floor(40 + Math.random() * 50),
    pressure: Math.floor(1000 + Math.random() * 30),
    windSpeed: Math.round((2 + Math.random() * 8) * 10) / 10,
    windDirection: windDir,
    description: condition.description,
    icon: condition.icon,
    visibility: Math.floor(5 + Math.random() * 15),
    clouds: Math.floor(Math.random() * 100),
    sunrise: sunrise.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    sunset: sunset.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    updatedAt: now.toISOString(),
  };
}

function generateMockForecast(city: string, days: number = 5, units: string = 'metric'): ForecastDay[] {
  const cityInfo = findCity(city);
  const lat = cityInfo?.lat || 30;
  const forecast: ForecastDay[] = [];
  
  const baseTemp = 20 - Math.abs(lat - 30) * 0.5;
  const seasonOffset = Math.sin((new Date().getMonth() - 3) * Math.PI / 6) * 15;
  
  for (let i = 0; i < Math.min(days, 7); i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    
    let tempMax = baseTemp + seasonOffset + 5 + (Math.random() - 0.5) * 8;
    let tempMin = tempMax - 8 - Math.random() * 4;
    
    if (units === 'imperial') {
      tempMax = tempMax * 9 / 5 + 32;
      tempMin = tempMin * 9 / 5 + 32;
    }
    
    const condition = WEATHER_CONDITIONS[Math.floor(Math.random() * WEATHER_CONDITIONS.length)];
    
    forecast.push({
      date: date.toISOString().split('T')[0],
      tempMax: Math.round(tempMax),
      tempMin: Math.round(tempMin),
      humidity: Math.floor(40 + Math.random() * 50),
      description: condition.description,
      icon: condition.icon,
      precipitation: Math.floor(Math.random() * 100),
    });
  }
  
  return forecast;
}

function generateMockAirQuality(city: string): AirQuality {
  const aqi = Math.floor(20 + Math.random() * 180);
  
  let level: AirQuality['level'];
  if (aqi <= 50) level = 'good';
  else if (aqi <= 100) level = 'moderate';
  else if (aqi <= 150) level = 'unhealthy-sensitive';
  else if (aqi <= 200) level = 'unhealthy';
  else if (aqi <= 300) level = 'very-unhealthy';
  else level = 'hazardous';
  
  return {
    aqi,
    level,
    pm25: Math.floor(10 + Math.random() * 100),
    pm10: Math.floor(20 + Math.random() * 150),
    o3: Math.floor(20 + Math.random() * 80),
    no2: Math.floor(10 + Math.random() * 60),
    so2: Math.floor(5 + Math.random() * 30),
    co: Math.round((0.5 + Math.random() * 2) * 10) / 10,
  };
}

function findCity(query: string): CityInfo | undefined {
  const key = query.toLowerCase().trim();
  return CITY_DATABASE[key];
}

function searchCities(query: string, limit: number = 5): CityInfo[] {
  const key = query.toLowerCase().trim();
  const results: CityInfo[] = [];
  
  for (const [cityKey, info] of Object.entries(CITY_DATABASE)) {
    if (cityKey.includes(key) || info.name.toLowerCase().includes(key)) {
      // 避免重复（中英文名可能指向同一城市）
      if (!results.some(r => r.name === info.name)) {
        results.push(info);
      }
    }
    if (results.length >= limit) break;
  }
  
  return results;
}

// ============================================================================
// 工具实现
// ============================================================================

async function getWeather(args: {
  city: string;
  units?: string;
}): Promise<unknown> {
  const { city, units = 'metric' } = args;
  const cache = loadWeatherCache();
  const cacheKey = getCacheKey(city);
  
  // 检查缓存
  const cached = cache.cache[cacheKey];
  if (cached?.weather && isCacheValid(cached.cachedAt)) {
    return {
      source: 'cache',
      weather: cached.weather,
    };
  }
  
  // 生成新数据
  const weather = generateMockWeather(city, units);
  
  // 更新缓存
  cache.cache[cacheKey] = {
    ...cache.cache[cacheKey],
    weather,
    cachedAt: new Date().toISOString(),
  };
  saveWeatherCache(cache);
  
  return {
    source: 'api',
    weather,
  };
}

async function getForecast(args: {
  city: string;
  days?: number;
  units?: string;
}): Promise<unknown> {
  const { city, days = 5, units = 'metric' } = args;
  const cache = loadWeatherCache();
  const cacheKey = getCacheKey(city);
  
  // 检查缓存
  const cached = cache.cache[cacheKey];
  if (cached?.forecast && isCacheValid(cached.cachedAt)) {
    return {
      source: 'cache',
      city,
      forecast: cached.forecast.slice(0, days),
    };
  }
  
  // 生成新数据
  const forecast = generateMockForecast(city, days, units);
  
  // 更新缓存
  cache.cache[cacheKey] = {
    ...cache.cache[cacheKey],
    forecast,
    cachedAt: new Date().toISOString(),
  };
  saveWeatherCache(cache);
  
  return {
    source: 'api',
    city,
    forecast,
  };
}

async function getAirQuality(args: { city: string }): Promise<unknown> {
  const { city } = args;
  const cache = loadWeatherCache();
  const cacheKey = getCacheKey(city);
  
  // 检查缓存
  const cached = cache.cache[cacheKey];
  if (cached?.airQuality && isCacheValid(cached.cachedAt)) {
    return {
      source: 'cache',
      city,
      airQuality: cached.airQuality,
    };
  }
  
  // 生成新数据
  const airQuality = generateMockAirQuality(city);
  
  // 更新缓存
  cache.cache[cacheKey] = {
    ...cache.cache[cacheKey],
    airQuality,
    cachedAt: new Date().toISOString(),
  };
  saveWeatherCache(cache);
  
  return {
    source: 'api',
    city,
    airQuality,
  };
}

async function searchCity(args: { query: string; limit?: number }): Promise<unknown> {
  const { query, limit = 5 } = args;
  const cities = searchCities(query, limit);
  
  return {
    count: cities.length,
    cities,
  };
}

async function setDefaultCity(args: { city: string }): Promise<unknown> {
  const { city } = args;
  const cache = loadWeatherCache();
  cache.defaultCity = city;
  saveWeatherCache(cache);
  
  return {
    success: true,
    defaultCity: city,
    message: `已设置默认城市为: ${city}`,
  };
}

async function getWeatherSummary(args: { city?: string }): Promise<unknown> {
  const cache = loadWeatherCache();
  const city = args.city || cache.defaultCity || 'Beijing';
  
  const weatherResult = await getWeather({ city }) as { weather: WeatherData };
  const weather = weatherResult.weather;
  
  const airResult = await getAirQuality({ city }) as { airQuality: AirQuality };
  const airQuality = airResult.airQuality;
  
  const forecastResult = await getForecast({ city, days: 1 }) as { forecast: ForecastDay[] };
  const todayForecast = forecastResult.forecast[0];
  
  // 生成适合语音播报的摘要
  const aqiDescription = {
    'good': '空气质量优',
    'moderate': '空气质量良',
    'unhealthy-sensitive': '空气质量对敏感人群不健康',
    'unhealthy': '空气质量不健康',
    'very-unhealthy': '空气质量非常不健康',
    'hazardous': '空气质量危险',
  };
  
  const summary = `${weather.city}今天${weather.description}，当前气温${Math.round(weather.temperature)}度，` +
    `体感温度${Math.round(weather.feelsLike)}度。` +
    `今天最高温度${todayForecast.tempMax}度，最低${todayForecast.tempMin}度。` +
    `${weather.windDirection}${weather.windSpeed}米每秒，湿度${weather.humidity}%。` +
    `${aqiDescription[airQuality.level]}，AQI指数${airQuality.aqi}。`;
  
  return {
    city: weather.city,
    summary,
    weather,
    airQuality,
    forecast: todayForecast,
  };
}

// ============================================================================
// 工具调用路由
// ============================================================================

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_weather':
      return getWeather(args as Parameters<typeof getWeather>[0]);
    case 'get_forecast':
      return getForecast(args as Parameters<typeof getForecast>[0]);
    case 'get_air_quality':
      return getAirQuality(args as { city: string });
    case 'search_city':
      return searchCity(args as { query: string; limit?: number });
    case 'set_default_city':
      return setDefaultCity(args as { city: string });
    case 'get_weather_summary':
      return getWeatherSummary(args as { city?: string });
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

// ============================================================================
// 资源读取
// ============================================================================

async function readResource(uri: string): Promise<{ text: string; mimeType: string }> {
  const cache = loadWeatherCache();
  const city = cache.defaultCity || 'Beijing';
  
  if (uri === 'weather://current') {
    const result = await getWeather({ city });
    return {
      text: JSON.stringify(result, null, 2),
      mimeType: 'application/json',
    };
  }
  
  if (uri === 'weather://forecast') {
    const result = await getForecast({ city, days: 5 });
    return {
      text: JSON.stringify(result, null, 2),
      mimeType: 'application/json',
    };
  }
  
  if (uri === 'weather://air-quality') {
    const result = await getAirQuality({ city });
    return {
      text: JSON.stringify(result, null, 2),
      mimeType: 'application/json',
    };
  }
  
  throw new Error(`未知资源: ${uri}`);
}

// ============================================================================
// MCP 协议处理
// ============================================================================

function sendResponse(id: number | string | undefined, result: unknown): void {
  const response: MCPMessage = {
    jsonrpc: '2.0',
    id,
    result,
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

function sendError(id: number | string | undefined, code: number, message: string): void {
  const response: MCPMessage = {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

async function handleMessage(message: MCPMessage): Promise<void> {
  const { id, method, params } = message;
  
  try {
    switch (method) {
      case 'initialize':
        sendResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: {
            name: 'weather-api',
            version: '1.0.0',
          },
        });
        break;
        
      case 'ping':
        sendResponse(id, { pong: true });
        break;
        
      case 'tools/list':
        sendResponse(id, { tools: TOOLS });
        break;
        
      case 'tools/call': {
        const { name, arguments: args } = params as { name: string; arguments: Record<string, unknown> };
        const result = await callTool(name, args || {});
        sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(result) }] });
        break;
      }
        
      case 'resources/list':
        sendResponse(id, { resources: RESOURCES });
        break;
        
      case 'resources/read': {
        const { uri } = params as { uri: string };
        const content = await readResource(uri);
        sendResponse(id, { contents: [content] });
        break;
      }
        
      default:
        sendError(id, -32601, `未知方法: ${method}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sendError(id, -32000, errorMessage);
  }
}

// ============================================================================
// 主入口
// ============================================================================

function main(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    
    try {
      const message = JSON.parse(line) as MCPMessage;
      await handleMessage(message);
    } catch {
      sendError(undefined, -32700, 'JSON 解析错误');
    }
  });
  
  rl.on('close', () => {
    process.exit(0);
  });
  
  process.on('uncaughtException', (error) => {
    process.stderr.write(`Uncaught exception: ${error.message}\n`);
  });
  
  process.on('unhandledRejection', (reason) => {
    process.stderr.write(`Unhandled rejection: ${reason}\n`);
  });
}

main();