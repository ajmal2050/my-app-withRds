pipeline {
    agent any

    environment {
        // AWS & ECR Variables
        AWS_REGION         = credentials('aws-region-secret')
        ECR_REGISTRY       = credentials('aws-ecr-registry-url')
        
        // Repositories (Reverted frontend to ECR_REPO as requested)
        ECR_REPO           = credentials('aws-ecr-repo-name')
        ECR_REPO_BACKEND   = credentials('aws-ecr-repo-name-backend')
        
        // ECS Fargate Variables
        ECS_CLUSTER        = 'staff-app-cluster'
        ECS_SERVICE        = 'staff-app-service'
        
        // Dynamic build tag
        IMAGE_TAG          = "${env.BUILD_NUMBER}"
    }

    stages {
        stage('1. Checkout Code') {
            steps {
                echo 'Checking out source code from GitHub...'
                checkout scm
            }
        }

        stage('2. Build & Push to ECR') {
            steps {
                echo 'Building and pushing directly to AWS ECR...'
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-ecr-credentials',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]) {
                    sh '''
                        # 1. Login to AWS ECR
                        aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
                        
                        # 2. Build and Tag Frontend (using ECR_REPO), then Push
                        docker build -t $ECR_REGISTRY/${ECR_REPO}:frontend-${IMAGE_TAG} ./frontend
                        docker push $ECR_REGISTRY/${ECR_REPO}:frontend-${IMAGE_TAG}
                        
                        # 3. Build and Tag Backend, then Push
                        docker build -t $ECR_REGISTRY/${ECR_REPO_BACKEND}:backend-${IMAGE_TAG} ./backend
                        docker push $ECR_REGISTRY/${ECR_REPO_BACKEND}:backend-${IMAGE_TAG}
                    '''
                }
            }
        }

        stage('3. Deploy to ECS Fargate') {
            steps {
                echo 'Deploying new containers to AWS ECS Fargate...'
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-ecr-credentials',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]) {
                    sh '''
                        # 1. Inject the new Image URLs into your ECS Task Definition Template
                        sed -e "s|<FRONTEND_IMAGE>|$ECR_REGISTRY/${ECR_REPO}:frontend-${IMAGE_TAG}|g" \
                            -e "s|<BACKEND_IMAGE>|$ECR_REGISTRY/${ECR_REPO_BACKEND}:backend-${IMAGE_TAG}|g" \
                            ecs-task-def-template.json > ecs-task-def.json
                            
                        # 2. Register the new Task Definition in AWS
                        REVISION=$(aws ecs register-task-definition --cli-input-json file://ecs-task-def.json --query 'taskDefinition.taskDefinitionArn' --output text)
                        
                        echo "Registered new ECS Task Definition: $REVISION"
                        
                        # 3. Update the ECS Service (AWS automatically attaches the new containers to your Load Balancer)
                        aws ecs update-service --cluster $ECS_CLUSTER --service $ECS_SERVICE --task-definition $REVISION --force-new-deployment
                    '''
                }
            }
        }
    }

    post {
        success {
            echo '✅ Pipeline succeeded! Fargate containers are spinning up and attaching to the ALB.'
        }
        failure {
            echo '❌ Pipeline failed. Please check the build logs above.'
        }
    }
}
