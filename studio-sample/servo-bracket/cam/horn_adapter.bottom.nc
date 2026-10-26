(Part: horn_adapter.step)
(Job: horn_adapter.job.json)
(Setup: bottom, tool axis -Z)
(WCS: G54 at stock_top_center)
(Z0: stock_top_center, on the top of the stock. After facing, the faced top is Z-5.000)
(Post: linuxcnc, for LinuxCNC, units mm, dwell P in seconds)
(T1: D6 mm flat_endmill 3 flutes 3FL carbide, aluminium: 10000 rpm, feed 1200 mm/min, plunge 360 mm/min)
(Tool length: every Z is the tool's lowest point, a drill's, spot drill's or chamfer mill's tip, a ball's bottom. Measure each tool's length there)
(Prove this program on the machine: single block, feed override low, in air first.)
G21
G90 G94 G17 G40 G49 G80 G91.1 G64 P0.01
G54
(Op 8: facing with T1)
G49
G53 G0 Z0
T1 M6
S10000 M3
G0 X-18 Y-11.6
G43 Z10 H1
M8
G0 Z1
G1 Z-1.666 F360
G1 X18 F1200
G0 Z3
G0 Y-8.286
G0 Z1
G1 Z-1.666 F360
G1 X-18 F1200
G0 Z3
G0 Y-4.971
G0 Z1
G1 Z-1.666 F360
G1 X18 F1200
G0 Z3
G0 Y-1.657
G0 Z1
G1 Z-1.666 F360
G1 X-18 F1200
G0 Z3
G0 Y1.657
G0 Z1
G1 Z-1.666 F360
G1 X18 F1200
G0 Z3
G0 Y4.971
G0 Z1
G1 Z-1.666 F360
G1 X-18 F1200
G0 Z3
G0 Y8.286
G0 Z1
G1 Z-1.666 F360
G1 X18 F1200
G0 Z3
G0 Y11.6
G0 Z1
G1 Z-1.666 F360
G1 X-18 F1200
G0 Z3
G0 Y-11.6
G0 Z-0.667
G1 Z-3.333 F360
G1 X18 F1200
G0 Z3
G0 Y-8.286
G0 Z-0.667
G1 Z-3.333 F360
G1 X-18 F1200
G0 Z3
G0 Y-4.971
G0 Z-0.667
G1 Z-3.333 F360
G1 X18 F1200
G0 Z3
G0 Y-1.657
G0 Z-0.667
G1 Z-3.333 F360
G1 X-18 F1200
G0 Z3
G0 Y1.657
G0 Z-0.667
G1 Z-3.333 F360
G1 X18 F1200
G0 Z3
G0 Y4.971
G0 Z-0.667
G1 Z-3.333 F360
G1 X-18 F1200
G0 Z3
G0 Y8.286
G0 Z-0.667
G1 Z-3.333 F360
G1 X18 F1200
G0 Z3
G0 Y11.6
G0 Z-0.667
G1 Z-3.333 F360
G1 X-18 F1200
G0 Z3
G0 Y-11.6
G0 Z-2.333
G1 Z-5 F360
G1 X18 F1200
G1 Y-8.286
G1 X-18
G1 Y-4.971
G1 X18
G1 Y-1.657
G1 X-18
G1 Y1.657
G1 X18
G1 Y4.971
G1 X-18
G1 Y8.286
G1 X18
G1 Y11.6
G1 X-18
G0 Z10
M5
M9
G49
G53 G0 Z0
M2
