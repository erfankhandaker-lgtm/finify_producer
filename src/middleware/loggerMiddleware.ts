import { Request, Response, NextFunction } from "express";
import { Injectable, NestMiddleware, Logger } from "@nestjs/common";
import {requestBodyLog, HttpUrlLog} from '../config/winstonLog'

@Injectable()
export class LoggerMiddleware implements NestMiddleware {

  use(request: Request, response: Response, next: NextFunction): void {
    const { ip, method, originalUrl, body } = request;
    const userAgent = request.get("user-agent") || "";

    requestBodyLog(body)

    response.on("finish", () => {
      const { statusCode } = response;
      const contentLength = response.get("content-length");

      HttpUrlLog(`${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} ${ip}`)

    });

    next();
  }
}