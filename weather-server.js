import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fetch from 'node-fetch';
import { z } from 'zod';

const server = new McpServer({
  name: 'weather-mcp',
  version: '0.0.1'
})

const CITY_MAP = {
  "北京": "101010100",
  "上海": "101020100",
  "武汉": "101200101"
}

// 注册城市天气查询工具
server.tool(
  "query_weather",
  {
    city: z.string().describe("要查询天气的城市名称，如北京、上海、广州等")
  },
  async ({ city }) => {
    try {
      let cityId = CITY_MAP[city];
      
      // 如果城市不在映射表中，返回提示信息
      if (!cityId) {
        return {
          content: [{ 
            type: "text", 
            text: `暂不支持查询"${city}"的天气信息。目前支持的城市有：${Object.keys(CITY_MAP).join("、")}` 
          }]
        };
      }
      
      // 构建魅族天气API URL
      const url = `http://aider.meizu.com/app/weather/listWeather?cityIds=${cityId}`;
      
      // 发送请求获取天气数据
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`天气API返回错误: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // 检查API返回状态
      if (data.code !== "200" || !data.value || !data.value[0]) {
        throw new Error(`获取天气数据失败: ${data.message || "未知错误"}`);
      }
      
      const weatherData = data.value[0];
      
      // 获取实时天气
      const realtime = weatherData.realtime;
      // 获取今日天气
      const today = weatherData.weathers.find(w => {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        return w.date === dateStr;
      }) || weatherData.weathers[0];
      
      // 获取生活指数
      const indexes = weatherData.indexes || [];
      
      // 格式化天气信息
      let result = `📍 ${weatherData.city}（${weatherData.provinceName}）实时天气\n`;
      result += `🕒 ${realtime.time}\n\n`;
      result += `🌡️ 当前温度: ${realtime.temp}°C (体感温度: ${realtime.sendibleTemp}°C)\n`;
      result += `☁️ 天气状况: ${realtime.weather}\n`;
      result += `💧 湿度: ${realtime.sD}%\n`;
      result += `🌬️ 风向风力: ${realtime.wD} ${realtime.wS}\n\n`;
      
      result += `📅 今日温度: ${today.temp_day_c}°C / ${today.temp_night_c}°C\n`;
      result += `🌞 日出/日落: ${today.sun_rise_time} / ${today.sun_down_time}\n\n`;
      
      // 添加空气质量信息（如果有）
      if (weatherData.pm25) {
        result += `🌫️ 空气质量: ${weatherData.pm25.quality} (AQI: ${weatherData.pm25.aqi})\n`;
        result += `💨 PM2.5: ${weatherData.pm25.pm25}, PM10: ${weatherData.pm25.pm10}\n\n`;
      }
      
      // 添加生活指数
      if (indexes.length > 0) {
        result += `🔍 生活指数参考:\n`;
        indexes.forEach(index => {
          // 添加对应的emoji
          let emoji = "ℹ️";
          switch (index.abbreviation) {
            case "ct": emoji = "👕"; break; // 穿衣
            case "pp": emoji = "💄"; break; // 化妆
            case "gm": emoji = "🤧"; break; // 感冒
            case "xc": emoji = "🚗"; break; // 洗车
            case "yd": emoji = "🏃"; break; // 运动
            case "uv": emoji = "☀️"; break; // 紫外线
          }
          result += `${emoji} ${index.name}(${index.level}): ${index.content}\n`;
        });
      }
      
      return {
        content: [{ type: "text", text: result.trim() }]
      };
    } catch (error) {
      console.error("查询天气时出错:", error);
      return {
        content: [{ type: "text", text: `查询天气时出错: ${error.message}` }],
        isError: true
      };
    }
  }
);

// 注册天气预报工具
server.tool(
  "query_forecast",
  {
    city: z.string().describe("要查询天气预报的城市名称")
  },
  async ({ city }) => {
    try {
      let cityId = CITY_MAP[city];
      
      // 如果城市不在映射表中，返回提示信息
      if (!cityId) {
        return {
          content: [{ 
            type: "text", 
            text: `暂不支持查询"${city}"的天气预报。目前支持的城市有：${Object.keys(CITY_MAP).join("、")}` 
          }]
        };
      }
      
      // 构建魅族天气API URL
      const url = `http://aider.meizu.com/app/weather/listWeather?cityIds=${cityId}`;
      
      // 发送请求获取天气数据
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`天气API返回错误: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // 检查API返回状态
      if (data.code !== "200" || !data.value || !data.value[0]) {
        throw new Error(`获取天气数据失败: ${data.message || "未知错误"}`);
      }
      
      const weatherData = data.value[0];
      
      // 获取天气预报
      const forecasts = weatherData.weathers || [];
      
      // 按日期排序（确保顺序正确）
      forecasts.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA - dateB;
      });
      
      // 排除过去的日期
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // 过滤出今天及未来的天气预报
      const futureForecasts = forecasts.filter(forecast => {
        const forecastDate = new Date(forecast.date);
        return forecastDate >= today;
      });
      
      // 格式化天气预报
      let result = `📅 ${weatherData.city}未来天气预报:\n\n`;
      
      futureForecasts.forEach((forecast, index) => {
        const date = new Date(forecast.date);
        const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
        
        // 添加天气图标
        let weatherEmoji = "☁️";
        if (forecast.weather.includes("晴")) weatherEmoji = "☀️";
        else if (forecast.weather.includes("雨")) weatherEmoji = "🌧️";
        else if (forecast.weather.includes("雪")) weatherEmoji = "❄️";
        else if (forecast.weather.includes("雾")) weatherEmoji = "🌫️";
        else if (forecast.weather.includes("雷")) weatherEmoji = "⛈️";
        
        result += `${index === 0 ? "📆 今天" : `📆 ${monthDay} ${forecast.week}`}:\n`;
        result += `${weatherEmoji} ${forecast.weather}\n`;
        result += `🌡️ ${forecast.temp_day_c}°C / ${forecast.temp_night_c}°C\n`;
        result += `🌞 ${forecast.sun_rise_time} - ${forecast.sun_down_time}\n\n`;
      });
      
      // 添加生活小贴士
      const indexes = weatherData.indexes || [];
      if (indexes.length > 0) {
        const randomIndex = Math.floor(Math.random() * indexes.length);
        result += `💡 今日小贴士: ${indexes[randomIndex].content}\n`;
      }
      
      return {
        content: [{ type: "text", text: result.trim() }]
      };
    } catch (error) {
      console.error("查询天气预报时出错:", error);
      return {
        content: [{ type: "text", text: `查询天气预报时出错: ${error.message}` }],
        isError: true
      };
    }
  }
);

// 注册精细天气预报工具
server.tool(
  "query_hourly_forecast",
  {
    city: z.string().describe("要查询精细天气预报的城市名称")
  },
  async ({ city }) => {
    try {
      let cityId = CITY_MAP[city];
      
      // 如果城市不在映射表中，返回提示信息
      if (!cityId) {
        return {
          content: [{ 
            type: "text", 
            text: `暂不支持查询"${city}"的精细天气预报。目前支持的城市有：${Object.keys(CITY_MAP).join("、")}` 
          }]
        };
      }
      
      // 构建魅族天气API URL
      const url = `http://aider.meizu.com/app/weather/listWeather?cityIds=${cityId}`;
      
      // 发送请求获取天气数据
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`天气API返回错误: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // 检查API返回状态
      if (data.code !== "200" || !data.value || !data.value[0]) {
        throw new Error(`获取天气数据失败: ${data.message || "未知错误"}`);
      }
      
      const weatherData = data.value[0];
      
      // 获取精细天气预报
      const hourlyForecasts = weatherData.weatherDetailsInfo?.weather3HoursDetailsInfos || [];
      
      if (hourlyForecasts.length === 0) {
        return {
          content: [{ type: "text", text: `暂无${city}未来几小时的精细天气预报数据` }]
        };
      }
      
      // 格式化精细天气预报
      let result = `⏱️ ${weatherData.city}未来逐3小时天气预报:\n\n`;
      
      hourlyForecasts.forEach(forecast => {
        const startTime = new Date(forecast.startTime);
        const endTime = new Date(forecast.endTime);
        
        const startHour = startTime.getHours();
        const endHour = endTime.getHours();
        
        // 添加天气图标
        let weatherEmoji = "☁️";
        if (forecast.weather.includes("晴")) weatherEmoji = "☀️";
        else if (forecast.weather.includes("雨")) weatherEmoji = "🌧️";
        else if (forecast.weather.includes("雪")) weatherEmoji = "❄️";
        else if (forecast.weather.includes("雾")) weatherEmoji = "🌫️";
        else if (forecast.weather.includes("雷")) weatherEmoji = "⛈️";
        
        result += `🕒 ${startHour}:00-${endHour}:00:\n`;
        result += `${weatherEmoji} ${forecast.weather}\n`;
        result += `🌡️ ${forecast.lowerestTemperature}°C - ${forecast.highestTemperature}°C\n`;
        
        // 添加降水信息（如果有）
        if (forecast.precipitation && forecast.precipitation !== "0") {
          result += `💧 降水量: ${forecast.precipitation}mm\n`;
        }
        
        result += `\n`;
      });
      
      return {
        content: [{ type: "text", text: result.trim() }]
      };
    } catch (error) {
      console.error("查询精细天气预报时出错:", error);
      return {
        content: [{ type: "text", text: `查询精细天气预报时出错: ${error.message}` }],
        isError: true
      };
    }
  }
);

async function main() {
  try {
    console.log('启动天气查询MCP服务器...')
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.log('MCP服务器已启动并等待连接')
  } catch (error) {
    console.error("启动服务器时出错:", error)
    process.exit(1)
  }
}

main()