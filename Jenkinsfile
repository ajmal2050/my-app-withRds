pipeline {
    agent any

    environment {
        // AWS Region & ECR Registry
        AWS_REGION           = 'ap-south-1'
        ECR_REGISTRY         = '835756672944.dkr.ecr.ap-south-1.amazonaws.com'
        
        // ECR Repositories
        ECR_REPO_FRONTEND    = 'myapp/frontend'
        ECR_REPO_BACKEND     = 'myapp/backend'
        
        // RDS Database Identifier
        RDS_INSTANCE_ID      = 'myapp-db'
        
        // ECS Fargate Variables
        ECS_CLUSTER          = 'myapp-cluster'
        ECS_SERVICE_FRONTEND = 'myapp-frontend-service'
        ECS_SERVICE_BACKEND  = 'myapp-backend-service'
        
        // Dynamic build tag
        IMAGE_TAG            = "${env.BUILD_NUMBER}"
    }

    stages {
        stage('1. Checkout Code') {
            steps {
                echo 'Checking out source code from Git...'
                checkout scm
            }
        }

        stage('2. Verify RDS Database Status') {
            steps {
                echo 'Verifying RDS instance status and health before deployment...'
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'AWS_CREDENTIALS',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]) {
                    sh '''
                        # Check RDS instance status
                        DB_STATUS=$(aws rds describe-db-instances \
                            --region ${AWS_REGION} \
                            --db-instance-identifier ${RDS_INSTANCE_ID} \
                            --query 'DBInstances[0].DBInstanceStatus' \
                            --output text)
                        
                        echo "=========================================="
                        echo "RDS Instance: ${RDS_INSTANCE_ID}"
                        echo "Current Status: ${DB_STATUS}"
                        echo "=========================================="

                        if [ "${DB_STATUS}" != "available" ]; then
                            echo "❌ Error: RDS Database is not in 'available' state (Current: ${DB_STATUS}). Aborting deployment."
                            exit 1
                        fi
                        
                        echo "✅ RDS instance is online and healthy."
                    '''
                }
            }
        }

        stage('3. Build & Push to ECR') {
            steps {
                echo 'Building and pushing Docker images to AWS ECR...'
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'AWS_CREDENTIALS',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]) {
                    sh '''
                        # 1. Login to AWS ECR
                        aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}
                        
                        # 2. Build and push Frontend
                        docker build -t ${ECR_REGISTRY}/${ECR_REPO_FRONTEND}:${IMAGE_TAG} ./frontend
                        docker push ${ECR_REGISTRY}/${ECR_REPO_FRONTEND}:${IMAGE_TAG}
                        
                        # 3. Build and push Backend
                        docker build -t ${ECR_REGISTRY}/${ECR_REPO_BACKEND}:${IMAGE_TAG} ./backend
                        docker push ${ECR_REGISTRY}/${ECR_REPO_BACKEND}:${IMAGE_TAG}
                    '''
                }
            }
        }

        stage('4. Deploy to ECS Fargate') {
            steps {
                echo 'Injecting RDS DB credentials and deploying task definitions to ECS...'
                withCredentials([
                    [$class: 'AmazonWebServicesCredentialsBinding',
                        credentialsId: 'AWS_CREDENTIALS',
                        accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                        secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'],
                    string(credentialsId: 'RDS_DB_HOST', variable: 'DB_HOST'),
                    string(credentialsId: 'RDS_DB_PORT', variable: 'DB_PORT'),
                    string(credentialsId: 'RDS_DB_NAME', variable: 'DB_NAME'),
                    string(credentialsId: 'RDS_DB_USER', variable: 'DB_USER'),
                    string(credentialsId: 'RDS_DB_PASSWORD', variable: 'DB_PASSWORD')
                ]) {
                    sh '''
                        # 1. Render Frontend Task Definition
                        sed -e "s|<FRONTEND_IMAGE>|${ECR_REGISTRY}/${ECR_REPO_FRONTEND}:${IMAGE_TAG}|g" \
                            frontend-task-def-template.json > frontend-task-def.json
                            
                        # 2. Render Backend Task Definition with RDS credentials from Jenkins
                        sed -e "s|<BACKEND_IMAGE>|${ECR_REGISTRY}/${ECR_REPO_BACKEND}:${IMAGE_TAG}|g" \
                            -e "s|<DB_HOST>|${DB_HOST}|g" \
                            -e "s|<DB_PORT>|${DB_PORT}|g" \
                            -e "s|<DB_NAME>|${DB_NAME}|g" \
                            -e "s|<DB_USER>|${DB_USER}|g" \
                            -e "s|<DB_PASSWORD>|${DB_PASSWORD}|g" \
                            backend-task-def-template.json > backend-task-def.json
                            
                        # 3. Register Task Definitions in AWS ECS
                        FRONTEND_REVISION=$(aws ecs register-task-definition \
                            --region ${AWS_REGION} \
                            --cli-input-json file://frontend-task-def.json \
                            --query 'taskDefinition.taskDefinitionArn' \
                            --output text)
                            
                        BACKEND_REVISION=$(aws ecs register-task-definition \
                            --region ${AWS_REGION} \
                            --cli-input-json file://backend-task-def.json \
                            --query 'taskDefinition.taskDefinitionArn' \
                            --output text)
                        
                        echo "Registered Frontend Revision: ${FRONTEND_REVISION}"
                        echo "Registered Backend Revision: ${BACKEND_REVISION}"
                        
                        # 4. Clean up temporary rendered JSON files
                        rm -f frontend-task-def.json backend-task-def.json

                        # 5. Update ECS Services to deploy new containers
                        echo "Updating Frontend Service..."
                        aws ecs update-service \
                            --region ${AWS_REGION} \
                            --cluster ${ECS_CLUSTER} \
                            --service ${ECS_SERVICE_FRONTEND} \
                            --task-definition ${FRONTEND_REVISION} \
                            --force-new-deployment
                        
                        echo "Updating Backend Service..."
                        aws ecs update-service \
                            --region ${AWS_REGION} \
                            --cluster ${ECS_CLUSTER} \
                            --service ${ECS_SERVICE_BACKEND} \
                            --task-definition ${BACKEND_REVISION} \
                            --force-new-deployment
                    '''
                }
            }
        }
    }

    post {
        success {
            echo '✅ Deployment complete: RDS verified, Docker images pushed, and ECS services updated on myapp-cluster.'
        }
        failure {
            echo '❌ Pipeline failed. Check the logs above for build, RDS, or ECS errors.'
        }
    }
}
