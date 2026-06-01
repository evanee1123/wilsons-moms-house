#!/bin/bash

# Dynasty analysis auto-runner
cd /Users/evankleiner/wilsons-moms-house/notebooks

# Log file with timestamp
LOG="/Users/evankleiner/Documents/NFL_pred/run_log.txt"
echo "=============================" >> $LOG
echo "Run started: $(date)" >> $LOG

# Activate anaconda and run the script
source /opt/anaconda3/etc/profile.d/conda.sh
conda activate base

/opt/anaconda3/bin/python3 wilsons_teams.py >> $LOG 2>&1

echo "Run finished: $(date)" >> $LOG
echo "" >> $LOG
