import axios from "axios";

const BASE_URL = "https://zkjpdcez9i.execute-api.us-east-1.amazonaws.com";
const api = axios.create({ baseURL: BASE_URL });

export default api;
