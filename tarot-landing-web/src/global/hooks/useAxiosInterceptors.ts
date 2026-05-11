import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../lib/axiosClient";

const useAxiosInterceptors = () => {
  // const { globalLogOutDispatch } = useContext(AuthContext);
  const navigate = useNavigate();

  axiosClient.interceptors.request.use(
    (config) => {
      if (!config.headers["Authorization"]) {
        if (localStorage.getItem("user")) {
          const authToken = JSON.parse(
            localStorage.getItem("user") ?? ""
          ).accessToken;

          config.headers["Authorization"] = "Bearer " + authToken;
        }
      }

      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  axiosClient.interceptors.response.use(
    (response) => {
      return response;
    },
    // (error) => {
    //   if (error.response && error.response.status === 401) {
    //     globalLogOutDispatch();
    //     navigate("/login");
    //   }
    //   return Promise.reject(error);
    // }
  );
};

export default useAxiosInterceptors;
