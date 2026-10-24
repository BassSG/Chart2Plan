// Generated literal threshold-stage port from All Indy 1.3.5 f_s_next*.
function afNextP_(stage,s){switch(stage){
case 0:return s.m5.rsi < 27 || s.m60.k > 40 || s.m240.k > 40 ? 1 : 0;
case 1:return s.m5.rsi > 32 ? 2 : 1;
case 2:return s.m5.rsi < 30 ? 3 : 2;
case 3:return s.m5.k > 20 ? 4 : 3;
case 4:return s.m5.k < 80 ? 5 : 4;
case 5:return s.m5.k > 20 || s.m5.rsi < 18 || s.m30.rsi < 18 ? 6 : 5;
case 6:return s.m5.rsi < 25 ? 7 : 6;
case 7:return s.m5.rsi > 31 || s.m5.k > 60 ? 8 : s.m15.rsi < 30 ? 4 : 7;
case 8:return s.m30.rsi > 35 ? 0 : s.m5.k < 20 ? 9 : 8;
case 9:return s.m1.k < 20 && s.m1.rsi < 30 ? 10 : 9;
default:return stage;}}
function afNextL1_(stage,s){switch(stage){
case 0:return s.m5.rsi < 25 ? 1 : 0;
case 1:return s.m5.k < 20 ? 2 : 1;
case 2:return s.m5.k > 80 ? 3 : 2;
case 3:return s.m5.k < 20 ? 4 : 3;
case 4:return s.m1.k > 80 ? 5 : 4;
case 5:return s.m1.k < 20 ? 6 : 5;
case 6:return s.m5.rsi > 35 ? 7 : 6;
case 7:return s.m5.rsi < 25 ? 8 : 7;
case 8:return s.m5.rsi > 33 ? 9 : 8;
case 9:return s.kdDown5 ? 10 : 9;
case 10:return s.kUp20_15 ? 11 : 10;
case 11:return s.m1.k < 20 && s.m1.rsi < 30 ? 12 : 11;
default:return stage;}}
function afNextL2_(stage,s){switch(stage){
case 0:return s.m3.rsi < 25 ? 1 : 0;
case 1:return s.m3.k < 20 ? 2 : 1;
case 2:return s.m3.k > 80 ? 3 : 2;
case 3:return s.m3.k < 20 ? 4 : 3;
case 4:return s.m1.k > 80 ? 5 : 4;
case 5:return s.m1.k < 20 ? 6 : 5;
case 6:return s.m3.rsi > 35 ? 7 : 6;
case 7:return s.m5.rsi < 25 ? 8 : 7;
case 8:return s.m5.rsi > 31 ? 9 : 8;
case 9:return s.kdDown5 ? 10 : 9;
case 10:return s.kUp20_15 ? 11 : 10;
case 11:return s.m1.k < 20 && s.m1.rsi < 30 ? 12 : 11;
default:return stage;}}
function afNextD_(stage,s){switch(stage){
case 0:return s.m15.k > 70 ? 1 : 0;
case 1:return s.m5.rsi > 77 ? 2 : 1;
case 2:return s.m5.rsi < 69 ? 3 : 2;
case 3:return s.m5.rsi > 77 ? 0 : s.m5.rsi > 72 ? 4 : 3;
case 4:return s.m1.k > 80 ? 5 : 4;
case 5:return s.m1.k < 20 ? 6 : 5;
case 6:return s.m1.k > 80 ? 7 : 6;
case 7:return s.m5.rsi > 75 ? 8 : 7;
case 8:return s.m5.rsi < 69 ? 9 : 8;
case 9:return s.m1.k > 80 && s.m1.rsi > 70 ? 10 : 9;
default:return stage;}}
function afNextS1_(stage,s){switch(stage){
case 0:return s.m15.k > 80 ? 1 : 0;
case 1:return s.m1.rsi > 70 ? 2 : 1;
case 2:return s.m1.k < 50 ? 3 : 2;
case 3:return s.m1.rsi < 50 ? 4 : 3;
case 4:return s.m1.k > 80 ? 5 : 4;
case 5:return s.m1.k < 79 ? 6 : 5;
case 6:return s.m15.rsi > 75 ? 7 : 6;
case 7:return s.m5.rsi > 75 ? 8 : 7;
case 8:return s.m1.rsi > 75 ? 9 : 8;
case 9:return s.m1.k > 80 ? 10 : 9;
case 10:return s.m5.rsi > 75 ? 11 : 10;
case 11:return s.m5.rsi < 68 ? 12 : 11;
case 12:return s.kdUp5 ? 13 : 12;
case 13:return s.kDown80_5 ? 14 : 13;
case 14:return s.m1.k > 80 && s.m1.rsi > 70 ? 15 : 14;
default:return stage;}}
function afNextS2_(stage,s){switch(stage){
case 0:return s.m1.k > 80 ? 1 : 0;
case 1:return s.m1.k < 79 ? 2 : 1;
case 2:return s.m15.rsi > 75 ? 3 : 2;
case 3:return s.m5.rsi > 75 ? 4 : 3;
case 4:return s.m5.rsi > 80 ? 5 : 4;
case 5:return s.m5.rsi < 77 ? 6 : 5;
case 6:return s.kdUp5 ? 7 : 6;
case 7:return s.kDown80_5 ? 8 : 7;
case 8:return s.m1.k > 80 && s.m1.rsi > 70 ? 9 : 8;
default:return stage;}}
