import { Injectable, HttpException  } from '@nestjs/common';
import {HttpService} from '@nestjs/axios';
import { map } from 'rxjs/operators';
import 'dotenv/config'
import {winstonLog} from '../../config/winstonLog'
import axios from 'axios'

@Injectable()
export class ApifetchService {

    constructor(private http: HttpService){ }

        async kaiosNotifyPaid(imei,next_pay_dl) {
        
        next_pay_dl = new Date(next_pay_dl)
        next_pay_dl = (next_pay_dl.getTime()-next_pay_dl.getMilliseconds())/1000

        const requestbody = {
            "imei":imei,
            "next_pay_dl": next_pay_dl
        
        }

        winstonLog.log('info', `${process.env.kaios_integration_service_base_url}/api/v1/kaios/notify_paid api Request Data : %o`, requestbody)

         const response = await axios({
            url : `${process.env.kaios_integration_service_base_url}/api/v1/kaios/notify_paid`,
            method : 'post',
            data : requestbody,
            headers : { 'Content-type': 'application/json', 'module' : process.env.kaios_header_module_key }

        })

        winstonLog.log('info', `${process.env.kaios_integration_service_base_url}/api/v1/kaios/notify_paid api Response Data : %o`, response.data)

        return response.data

    }
     async fetch3partyapi(body) {
      
         
    }

    async getQuotes(){
        return this.http.get('https://jsonplaceholder.typicode.com/todos')
            .pipe(
                map(response => response.data)
            );
    }

    async submitQuotes(requestbody){
        const data =  await this.http.request({
            url : 'https://jsonplaceholder.typicode.com/todos',
            method : 'post',
            data : JSON.stringify(requestbody),
              headers : {
                'Content-type': 'application/json; charset=UTF-8',
              }

        }).pipe(
                map(response => response.data)
            );

        return data
    }
    getQuote(id){
        return this.http.get('https://jsonplaceholder.typicode.com/todos/' + id)
            .pipe(
                map(response => response.data)
            );
    }
 
}
